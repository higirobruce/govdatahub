import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MatchEntity } from '../../database/entities';
import type { MatchProject, MatchRun, MatchSourceRef } from '../../database/entities';

export interface CrosswalkPublishResult {
  written: number;
}

/** One row this service is about to upsert into `match_crosswalk`. */
interface CrosswalkRowInput {
  sourceKey: string;
  entityKey: string;
}

/**
 * PostgreSQL's wire protocol caps a single statement at 65535 bound
 * parameters -- a protocol constraint, not a tuning knob (the same limit
 * `MaterializeService.insertPage` chunks the workspace load against).
 * Each crosswalk row binds six values: `organization_id`, `project_id`,
 * `source_ref`, `source_key`, `entity_key`, `confidence`.
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
   * Must produce byte-identical output to `ClusteringService`'s private
   * `buildSourceRef` for the same source: Task 9 stamps this exact string
   * into every `MatchEntity.members[].sourceRef` at cluster time, and this
   * is the only key the Crosswalk can use to join back to the clusters it
   * came from. If the two ever disagree, no test here or in
   * `clustering.service.spec.ts` can catch it -- both suites mock
   * `dataSource.query`/the repository and never run the two
   * implementations side by side. See `clustering.service.ts:297` for the
   * sibling implementation; the task report for this service records a
   * direct line-by-line comparison of the two.
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
   * `sourceRef` is computed once from `project.leftSource` via
   * `this.sourceRef(...)`, never read off a member's own stored
   * `sourceRef` -- both must agree by construction (see `sourceRef`'s
   * doc comment), but computing it fresh here means this method's
   * correctness never depends on what a prior run happened to persist.
   *
   * Entity keys are never regenerated or reordered here: each row binds
   * `cluster.entityKey` exactly as `ClusteringService.resolveEntityKey`
   * decided it, which is what keeps the key stable across re-runs.
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

    const ref = this.sourceRef(project.leftSource);
    const rows: CrosswalkRowInput[] = [];
    for (const cluster of clusters) {
      if (cluster.flagged) continue; // defence in depth -- see doc comment above.
      for (const member of cluster.members) {
        rows.push({ sourceKey: member.sourceKey, entityKey: cluster.entityKey });
      }
    }

    if (rows.length === 0) return { written: 0 };

    const maxRowsPerStatement = Math.max(1, Math.floor(PG_MAX_BOUND_PARAMS / PARAMS_PER_ROW));
    let written = 0;
    for (let offset = 0; offset < rows.length; offset += maxRowsPerStatement) {
      const chunk = rows.slice(offset, offset + maxRowsPerStatement);
      await this.upsertChunk(project.organizationId, project.id, ref, chunk);
      written += chunk.length;
    }

    // Counts and the run/project ids only -- a source key is personal
    // data and never goes to the log.
    this.logger.log(
      `Run ${run.id}: published ${written} crosswalk row(s) from ${clusters.length} unflagged cluster(s)`,
    );

    return { written };
  }

  /**
   * One parameterized, multi-row `INSERT ... ON CONFLICT DO UPDATE`.
   *
   * The `ON CONFLICT` target lists exactly the four columns of
   * `pk_match_crosswalk` (see the `1711000000010-AddEntityMatching`
   * migration), in the same order, with no partial predicate on either
   * side -- anything else and PostgreSQL's arbiter-inference fails at
   * runtime rather than at review time.
   *
   * `confidence` has no per-member score to publish in phase 1 --
   * clustering only records a cluster-level `flagged` boolean, not a
   * per-pair score carried forward to this stage -- so every published
   * row is written with `confidence = 1`. This is a known phase-1 gap,
   * not a considered scoring decision; a later phase that wants a real
   * confidence value will need to plumb one through from scoring or
   * clustering into `MatchEntity` first.
   *
   * Every bound value carries an explicit cast, matching the convention
   * in `materialize.service.ts` and `scoring.service.ts`: a bare `$n` in
   * a multi-row `INSERT ... VALUES` is usually inferable from the target
   * column, but casting removes any doubt and keeps this statement
   * consistent with its siblings.
   */
  private async upsertChunk(
    organizationId: string,
    projectId: string,
    sourceRef: string,
    chunk: CrosswalkRowInput[],
  ): Promise<void> {
    const params: unknown[] = [];
    const valueTuples: string[] = [];
    let p = 1;

    for (const row of chunk) {
      params.push(organizationId, projectId, sourceRef, row.sourceKey, row.entityKey, 1);
      valueTuples.push(
        `($${p++}::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::text, $${p++}::double precision, now())`,
      );
    }

    await this.dataSource.query(
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
