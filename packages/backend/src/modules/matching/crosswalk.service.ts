import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MatchEntity } from '../../database/entities';
import type { MatchProject, MatchRun, MatchSourceRef } from '../../database/entities';

export interface CrosswalkPublishResult {
  written: number;
}

/** One row this service is about to upsert into `match_crosswalk`. */
interface CrosswalkRowInput {
  sourceRef: string;
  sourceKey: string;
  entityKey: string;
}

/**
 * PostgreSQL's wire protocol caps a single statement at 65535 bound
 * parameters -- a protocol constraint, not a tuning knob (the same limit
 * `MaterializeService.insertPage` chunks the workspace load against).
 * Each crosswalk row binds six values: `organization_id`, `project_id`,
 * `source_ref`, `source_key`, `entity_key`, `confidence` -- a `NULL`
 * `confidence` (Ruling R27) still occupies a bound-parameter slot, so
 * this count does not change when the value it carries does.
 */
const PG_MAX_BOUND_PARAMS = 65535;
const PARAMS_PER_ROW = 6;

/**
 * Publishes the entity-key Crosswalk: the table mapping every original
 * record to the `entity_key` its cluster was assigned. This is the
 * feature's product -- a cross-database join across two agencies' data
 * has nothing else to join on.
 *
 * Phase 1, dedupe-only, zero model calls. `golden` (survivorship) is
 * phase 3 and is not this service's concern.
 */
@Injectable()
export class CrosswalkService {
  private readonly logger = new Logger(CrosswalkService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MatchEntity) private readonly entityRepo: Repository<MatchEntity>,
  ) {}

  /**
   * `'connection:<connectionId>:<schema>.<table>'` or
   * `'staged:<stagedDataId>'`.
   *
   * `publish` below does *not* call this to build a row's `source_ref` --
   * it reads the value `ClusteringService` already stamped onto each
   * `MatchMember`, per member, so a re-derivation can never drift from
   * what was actually persisted. This method stays the canonical
   * formatter for any caller that only has a bare `MatchSourceRef` and
   * needs the same string (it is also what the brief specifies as this
   * service's public surface).
   *
   * `ClusteringService` still carries a private copy of this exact rule
   * (`buildSourceRef`, `clustering.service.ts:297`) because it was
   * written before this service existed. The two bodies are
   * byte-identical today; that agreement was verified by direct
   * comparison, not inferred from passing tests (see the Task 10
   * report). Consolidating the two into one shared implementation is
   * deferred rather than done here -- reaching back into Task 9's
   * completed, reviewed code is out of scope for this task -- but
   * whichever of the two is next touched should fold the other into it.
   */
  sourceRef(source: MatchSourceRef): string {
    if (source.kind === 'connection') {
      return `connection:${source.connectionId}:${source.schemaName}.${source.tableName}`;
    }
    return `staged:${source.stagedDataId}`;
  }

  /**
   * Reads this run's clusters and writes one `match_crosswalk` row per
   * member of every *unflagged* cluster, upserted on the table's primary
   * key (`organization_id, project_id, source_ref, source_key`) so a
   * re-run updates rows in place instead of duplicating them.
   *
   * A flagged cluster -- one Task 9's over-merge guard could not clear,
   * including one where a person explicitly recorded two of its members
   * as *not* the same entity -- contributes zero rows. Publishing it would
   * put a merge into the published Crosswalk that the guard, or a human,
   * specifically withheld. Filtered twice, deliberately: once in the
   * repository read (`where: { flagged: false }`, so a real run never
   * transfers a flagged cluster's rows off the database at all) and once
   * again in memory immediately after, so this method's own behaviour
   * does not depend on the read actually having applied that filter.
   *
   * Each row's `source_ref` is `member.sourceRef` -- the exact string
   * `ClusteringService` stamped onto that member at cluster time -- read
   * per member, not computed once from `project.leftSource` and not
   * copied from `members[0]`. In phase 1 (one Match Source per dedupe
   * project) every member of a cluster carries the same value, so the
   * two approaches are indistinguishable today; phase 3 adds a second
   * source, and reading each member's own value is what keeps this
   * correct once that lands instead of silently wrong.
   *
   * Entity keys are never regenerated or reordered here: each row binds
   * `cluster.entityKey` exactly as `ClusteringService.resolveEntityKey`
   * decided it, which is what keeps the key stable across re-runs.
   *
   * **Publication REPLACES, it does not accumulate (Ruling R48).** Before
   * the upserts, one `DELETE` withdraws every row of this project's own
   * source that this run did not publish. Without it a published merge
   * could never be withdrawn: a steward records `no_match`, the
   * over-merge guard flags the cluster, this method correctly writes
   * nothing for it -- and the rows the PREVIOUS run wrote still say those
   * records are one person. The verdict reached scoring and never reached
   * the published product, which is the one artefact other systems join
   * against. The same held for a raised threshold, a deleted source row,
   * and a cluster that split back into singletons: singletons never reach
   * the Crosswalk at all (clusters come only from `unionFind` over
   * surviving pairs), so a re-split record kept a stale merge claim
   * permanently.
   *
   * Replacing is sound precisely because everything upstream is
   * recomputed from scratch every run -- materialization drops and
   * reloads the whole workspace -- so the latest run's conclusions are
   * the complete current picture, not a delta against an older one. A
   * flagged cluster is deliberately not published and its earlier claim
   * is therefore withdrawn: the register stops asserting that two people
   * are one while a human decides, which is the safe direction.
   *
   * The whole write is one transaction: the delete and every upsert chunk
   * commit together or not at all. `match_crosswalk` is a permanent table
   * other features join against live, unlike the per-run workspace table
   * `MaterializeService.insertPage` chunks without one (that table is
   * dropped and rebuilt every run, so a mid-loop failure there is
   * harmless). A cluster large enough to need a second chunk that then
   * fails would otherwise leave the first chunk durably committed and the
   * published Crosswalk sitting partially updated until the next
   * successful run. With the withdrawal in the same transaction the
   * stakes are higher still -- a committed delete with uncommitted
   * upserts would be a published register that had lost rows -- which is
   * exactly why there is no path here that writes outside the
   * transaction.
   */
  async publish(project: MatchProject, run: MatchRun): Promise<CrosswalkPublishResult> {
    const clusters = await this.entityRepo.find({
      where: {
        organizationId: project.organizationId,
        projectId: project.id,
        runId: run.id,
        flagged: false,
      },
    });

    const rows: CrosswalkRowInput[] = [];
    for (const cluster of clusters) {
      if (cluster.flagged) continue; // defence in depth -- see doc comment above.
      for (const member of cluster.members) {
        rows.push({ sourceRef: member.sourceRef, sourceKey: member.sourceKey, entityKey: cluster.entityKey });
      }
    }

    // Ruling R48: NO early return on an empty row set. A run that
    // publishes nothing must still withdraw everything it previously
    // published -- "this run found no duplicates" is a conclusion, not
    // an absence of one, and the early return that used to sit here was
    // precisely the path that let a flagged or split cluster keep its
    // stale merge claim forever.
    const ownRef = this.sourceRef(project.leftSource);
    const publishedKeys = rows.filter((row) => row.sourceRef === ownRef).map((row) => row.sourceKey);

    const maxRowsPerStatement = Math.max(1, Math.floor(PG_MAX_BOUND_PARAMS / PARAMS_PER_ROW));
    let written = 0;
    await this.dataSource.transaction(async (manager: EntityManager) => {
      await this.withdrawUnpublished(manager, project.organizationId, project.id, ownRef, publishedKeys);
      for (let offset = 0; offset < rows.length; offset += maxRowsPerStatement) {
        const chunk = rows.slice(offset, offset + maxRowsPerStatement);
        await this.upsertChunk(manager, project.organizationId, project.id, chunk);
        written += chunk.length;
      }
    });

    // Counts and the run/project ids only -- a source key is personal
    // data and never goes to the log.
    this.logger.log(
      `Run ${run.id}: published ${written} crosswalk row(s) from ${clusters.length} unflagged cluster(s); ` +
        `withdrew every row of ${ownRef} not among them`,
    );

    return { written };
  }

  /**
   * Ruling R48's withdrawal half: delete every `match_crosswalk` row of
   * this project's own source whose `source_key` this run did not
   * publish. Issued on the transaction's manager, before the upserts, so
   * withdrawal and publication are one atomic replacement.
   *
   * **Scoped by `source_ref` as well as organization and project, never
   * by project alone.** Phase 1 gives a dedupe project exactly one Match
   * Source, so today the two are the same set of rows; phase 3 adds a
   * second source, and a project-wide delete would then wipe the other
   * source's rows every time this one published. The ref used is the
   * project's own -- `sourceRef(project.leftSource)`, byte-identical to
   * what `ClusteringService.buildSourceRef` stamps onto each member --
   * and the keep-set is filtered to that same ref, so a member carrying
   * some other ref is upserted but never used to keep or withdraw rows
   * outside this source's slice.
   *
   * The keep-set travels as ONE bound parameter -- a `text[]` -- rather
   * than as N placeholders. That is not an oversight of the 65535
   * bound-parameter cap the upsert loop chunks against; it is the only
   * correct shape. A negated set predicate cannot be chunked the way an
   * `INSERT` can: each chunk would delete the rows every OTHER chunk
   * means to keep, so a chunked withdrawal of a large key set would
   * destroy almost the entire published Crosswalk. One array parameter
   * sidesteps the cap entirely -- four parameters whatever the set size
   * -- and `NOT EXISTS (SELECT ... FROM unnest(...))` lets PostgreSQL
   * hash the keep-set into an anti-join instead of re-scanning the array
   * per row, which `<> ALL(...)` would.
   *
   * An empty keep-set is the important case, not a degenerate one: it is
   * the run that published nothing and must therefore withdraw
   * everything. `unnest('{}'::text[])` yields no rows, `NOT EXISTS` is
   * true for every row, and the whole slice is deleted -- which is the
   * intended behaviour, so this method deliberately has no "nothing to
   * do" guard on the key set.
   */
  private async withdrawUnpublished(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    sourceRef: string,
    publishedKeys: string[],
  ): Promise<void> {
    await manager.query(
      `DELETE FROM "match_crosswalk" AS c ` +
        `WHERE c."organization_id" = $1::text ` +
        `AND c."project_id" = $2::text ` +
        `AND c."source_ref" = $3::text ` +
        `AND NOT EXISTS (` +
        `SELECT 1 FROM unnest($4::text[]) AS published(source_key) ` +
        `WHERE published.source_key = c."source_key")`,
      [organizationId, projectId, sourceRef, publishedKeys],
    );
  }

  /**
   * One parameterized, multi-row `INSERT ... ON CONFLICT DO UPDATE`,
   * issued on the transaction's manager (see `publish`'s doc comment for
   * why the whole loop is one transaction) rather than on `this.dataSource`
   * directly.
   *
   * The `ON CONFLICT` target lists exactly the four columns of
   * `pk_match_crosswalk` (see the `1711000000010-AddEntityMatching`
   * migration), in the same order, with no partial predicate on either
   * side -- anything else and PostgreSQL's arbiter-inference fails at
   * runtime rather than at review time.
   *
   * `confidence` is written as `NULL` (Ruling R27): phase 1 has no
   * calibrated value to put there -- the weight model's coefficients are
   * tuned against a gold set, not a probability, and clustering carries
   * forward only a cluster-level `flagged` boolean, not a per-member
   * score. A constant such as `1` was rejected: it would assert certainty
   * the system never computed, making a marginal cluster indistinguishable
   * from a genuinely confident one to any consumer filtering on this
   * column, where `NULL` lets that filter fail closed instead. Phase 4's
   * Fellegi-Sunter work is what populates this column for real.
   *
   * Every bound value -- `NULL` included -- carries an explicit cast,
   * matching the convention in `materialize.service.ts` and
   * `scoring.service.ts`: a bare `$n` in a multi-row `INSERT ... VALUES`
   * is usually inferable from the target column, but casting removes any
   * doubt and keeps this statement consistent with its siblings.
   */
  private async upsertChunk(
    manager: EntityManager,
    organizationId: string,
    projectId: string,
    chunk: CrosswalkRowInput[],
  ): Promise<void> {
    const params: unknown[] = [];
    const valueTuples: string[] = [];
    let p = 1;

    for (const row of chunk) {
      params.push(organizationId, projectId, row.sourceRef, row.sourceKey, row.entityKey, null);
      valueTuples.push(
        `($${p++}::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::double precision, now())`,
      );
    }

    await manager.query(
      `INSERT INTO "match_crosswalk" ` +
        `("organization_id", "project_id", "source_ref", "source_key", "entity_key", "confidence", "updated_at") ` +
        `VALUES ${valueTuples.join(', ')} ` +
        `ON CONFLICT ("organization_id", "project_id", "source_ref", "source_key") ` +
        `DO UPDATE SET "entity_key" = EXCLUDED."entity_key", ` +
        `"confidence" = EXCLUDED."confidence", "updated_at" = EXCLUDED."updated_at"`,
      params,
    );
  }
}
