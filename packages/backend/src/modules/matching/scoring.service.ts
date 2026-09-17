import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { BlockingPass, FieldMapping, MatchProject, MatchRun } from '../../database/entities';
import { assertIdent, comparatorExprs, weightedScoreExpr } from './blocking-sql';
import { BlockingService } from './blocking.service';
import { MaterializeService } from './materialize.service';

export interface ScoreResult {
  /** Rows this pass newly inserted into `match_candidates`. */
  inserted: number;
  /** Of `inserted`, those labelled `auto_match` by the threshold. */
  autoMatch: number;
  /** Of `inserted`, those labelled `grey` by the threshold. `inserted` can exceed `autoMatch + grey`: a pair carrying a human verdict is stored as `confirmed`/`rejected` and counts in neither. */
  grey: number;
  /**
   * Ruling R24: **candidate pairs seen minus rows newly inserted** --
   * `total - inserted`, nothing more.
   *
   * Read the name as shorthand, not as a definition. Because the insert is
   * `ON CONFLICT DO NOTHING`, a pair an *earlier pass already stored* is
   * counted by this pass's total but skipped by its insert, so it lands in
   * this number alongside the genuinely auto-rejected pairs. Separating the
   * two would need a third statement per pass, which Ruling P9 forbids for
   * a reason that still holds: the rejected pairs number in the hundreds of
   * millions and must never be selected.
   *
   * Anything surfacing this on a run summary must label it "pairs not
   * stored", not "rejected".
   */
  autoReject: number;
}

/** The single row the counted insert returns. */
interface InsertSummaryRow {
  inserted: string;
  auto_match: string;
  grey: string;
}

/** The single row the candidate-pair count returns. */
interface CountRow {
  total: string;
}

/** A statement plus the values its `$n` placeholders bind, in order. */
interface Statement {
  sql: string;
  params: unknown[];
}

/**
 * Scores one blocking pass's candidate pairs and writes the survivors to
 * `match_candidates`.
 *
 * Two statements per pass, in this order (Ruling P9):
 *  1. `SELECT count(*) AS total` over the candidate-pair CTE;
 *  2. the same CTE, scored, inserted, and counted by what the insert
 *     actually wrote.
 *
 * `autoReject` is (1) minus (2) -- see `ScoreResult.autoReject` for what
 * that difference actually counts (Ruling R24). The rejected pairs are
 * never selected, never returned and never stored: at the cap of
 * 250,000,000 candidate pairs and roughly 200 bytes a row, materializing
 * them would be a 40 GB table whose only use is a number this subtraction
 * already has. The one class of pair stored below `rejectAt` is one a
 * person has already ruled on (Ruling R23), bounded by what people can
 * physically review.
 *
 * Both statements and the pass's session settings run inside one explicit
 * transaction, because `SET LOCAL` is transaction-scoped and is otherwise
 * a no-op with a warning (Ruling R21) -- and because a GUC that applied
 * to only one of the two statements would let the count and the insert
 * see different candidate sets.
 *
 * Phase 1 is dedupe-only and makes zero model calls.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly materialize: MaterializeService,
    private readonly blocking: BlockingService,
  ) {}

  /**
   * Scores every candidate pair `pass` proposes and inserts those at or
   * above `project.thresholds.rejectAt`, plus any pair carrying a human
   * verdict in `match_decisions` regardless of its score (Ruling R23).
   *
   * `droppedKeys` is the pass's degenerate-key exclusion list from
   * `BlockingService.estimate`; it is threaded straight through to
   * `candidatePairsSql`, which binds it as `$1..$n`, so this service's own
   * parameters are numbered from `$n+1` (see `scoreStatement`).
   */
  async scorePass(
    project: MatchProject,
    run: MatchRun,
    pass: BlockingPass,
    droppedKeys: string[],
  ): Promise<ScoreResult> {
    this.assertScorable(project, run);

    // Everything is built and validated before the first statement is
    // issued, so a bad field map, weight or threshold fails with nothing
    // written rather than half-way through a pass.
    const pairsSql = this.blocking.candidatePairsSql(project, pass, droppedKeys);
    const settings = this.blocking.passSessionSettings(pass);
    const count = this.countStatement(pairsSql, droppedKeys);
    const insert = this.scoreStatement(project, run, pass, pairsSql, droppedKeys);

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // Ruling R21: these govern the pass's join predicate and must be in
      // force for both statements below, hence inside this transaction.
      for (const setting of settings) {
        await manager.query(setting);
      }

      const countRows: CountRow[] = await manager.query(count.sql, count.params);
      const total = this.toCount(countRows?.[0]?.total, 'candidate pair total');

      const insertRows: InsertSummaryRow[] = await manager.query(insert.sql, insert.params);
      const summary = insertRows?.[0];
      const inserted = this.toCount(summary?.inserted, 'inserted count');
      const autoMatch = this.toCount(summary?.auto_match, 'auto_match count');
      const grey = this.toCount(summary?.grey, 'grey count');

      // Ruling P9: derived, never queried.
      const autoReject = total - inserted;

      // Counts only -- a blocking key or a source key is personal data and
      // never goes to the log.
      this.logger.log(
        `Pass "${pass.name}" (run ${run.id}): ${total} candidate pairs, ` +
          `${inserted} stored (${autoMatch} auto_match, ${grey} grey), ${autoReject} auto-rejected`,
      );

      return { inserted, autoMatch, grey, autoReject };
    });
  }

  /**
   * Statement 1 (Ruling P9): how many pairs the pass proposes, counted
   * server-side over the identical candidate-pair CTE the insert scores.
   *
   * Sharing the exact same `pairsSql` text -- and the same transaction and
   * session settings -- is what makes `total - inserted` a count of
   * auto-rejected pairs rather than the difference between two candidate
   * sets that drifted apart.
   */
  private countStatement(pairsSql: string, droppedKeys: string[]): Statement {
    return {
      sql: `WITH pairs AS (\n${pairsSql}\n)\nSELECT count(*) AS total FROM pairs`,
      params: [...droppedKeys],
    };
  }

  /**
   * Statement 2 (Ruling P9): score every candidate pair, insert those at
   * or above `rejectAt`, and return counts of what was actually written.
   *
   * Shape, and why each level exists:
   *  - `pairs` -- Task 7's candidate-pair SQL verbatim. It yields
   *    `left_key`/`right_key` only, already guarded by
   *    `l."src_key" < r."src_key"`.
   *  - `decisions` -- one row per *order-normalized* key pair for this
   *    org and project. `least`/`greatest` on both sides of the join is
   *    what lets a verdict a person recorded as `(b, a)` be found for a
   *    candidate pair proposed as `(a, b)`; the `GROUP BY` is what stops a
   *    pair that has more than one decision row (both orders, or two
   *    source refs -- `uq_match_decisions_pair` permits either) from
   *    multiplying the candidate row and corrupting the inserted count.
   *  - `scored` -- re-joins the workspace table as `l` and `r` on the
   *    primary key `src_key`, which is what brings the field columns into
   *    scope for the comparator expressions (`weightedScoreExpr` emits
   *    `l."x"`/`r."x"` references, so those two aliases are load-bearing).
   *    Both joins are 1:1 on a primary key, so they can neither multiply
   *    nor drop a pair, and the count statement therefore sees exactly the
   *    set this one scores.
   *  - `ins` -- the insert, with `RETURNING` feeding the outer aggregate.
   *    Rows skipped by `ON CONFLICT DO NOTHING` are not returned, so
   *    `inserted` is what was really written. Its row filter is
   *    `score >= rejectAt OR human_decision IS NOT NULL` (Ruling R23): a
   *    steward adjudicates exactly the pairs the score was unsure about, so
   *    a confirmed pair is disproportionately likely to score *below*
   *    `rejectAt`, and filtering on score alone would discard the human
   *    verdict before the decision join could honour it.
   *
   * Every parameter carries an explicit cast: a bare `$n` in the select
   * list of an `INSERT ... SELECT` is not resolved from the target
   * column's type, and PostgreSQL would refuse the statement with "could
   * not determine data type".
   */
  private scoreStatement(
    project: MatchProject,
    run: MatchRun,
    pass: BlockingPass,
    pairsSql: string,
    droppedKeys: string[],
  ): Statement {
    const table = this.materialize.workspaceTable(project.id, 'left');
    const passName = assertIdent(pass.name, 'blocking pass name');
    const { matchAt, rejectAt } = this.thresholds(project);
    const fieldMap = this.selfJoinFieldMap(project);

    // `candidatePairsSql` binds the dropped keys as $1..$n, so this
    // statement's own parameters start after them. Getting this offset
    // wrong does not fail loudly on every input -- with an empty
    // `droppedKeys` it is invisible -- so the numbering is derived once,
    // here, and the parameter array is built in the same order below.
    const base = droppedKeys.length;
    const pOrg = base + 1;
    const pProject = base + 2;
    const pRun = base + 3;
    const pPass = base + 4;
    const pMatchAt = base + 5;
    const pRejectAt = base + 6;

    const sql =
      `WITH pairs AS (\n${pairsSql}\n), decisions AS (\n` +
      `  SELECT least("left_key", "right_key") AS k1,\n` +
      `         greatest("left_key", "right_key") AS k2,\n` +
      `         (array_agg("decision" ORDER BY "created_at" DESC, "id" DESC))[1] AS decision\n` +
      `  FROM "match_decisions"\n` +
      `  WHERE "organization_id" = $${pOrg}::text\n` +
      `    AND "project_id" = $${pProject}::text\n` +
      `    AND "decision" IN ('confirmed', 'rejected')\n` +
      `  GROUP BY least("left_key", "right_key"), greatest("left_key", "right_key")\n` +
      `), scored AS (\n` +
      `  SELECT p.left_key AS left_key,\n` +
      `         p.right_key AS right_key,\n` +
      `         ${this.featuresExpr(fieldMap)} AS features,\n` +
      `         (${weightedScoreExpr(fieldMap)})::double precision AS score,\n` +
      `         d.decision AS human_decision\n` +
      `  FROM pairs p\n` +
      `  JOIN ${table} l ON l."src_key" = p.left_key\n` +
      `  JOIN ${table} r ON r."src_key" = p.right_key\n` +
      `  LEFT JOIN decisions d\n` +
      `    ON d.k1 = least(p.left_key, p.right_key) AND d.k2 = greatest(p.left_key, p.right_key)\n` +
      `), ins AS (\n` +
      `  INSERT INTO "match_candidates" ` +
      `("organization_id", "run_id", "left_key", "right_key", "blocking_pass", "features", "score", "decision")\n` +
      `  SELECT $${pOrg}::text, $${pRun}::text, left_key, right_key, $${pPass}::text, features, score,\n` +
      `         CASE WHEN human_decision IS NOT NULL THEN human_decision\n` +
      `              WHEN score >= $${pMatchAt}::double precision THEN 'auto_match'\n` +
      `              ELSE 'grey' END\n` +
      `  FROM scored\n` +
      // Ruling R23: `OR human_decision IS NOT NULL` is one more predicate
      // over the LEFT JOIN this statement already has, not a second
      // statement. It does not weaken "never store a rejected pair": that
      // rule is about the hundreds of millions of auto-rejects, and
      // human-decided pairs are bounded by what people can physically
      // review.
      `  WHERE score >= $${pRejectAt}::double precision OR human_decision IS NOT NULL\n` +
      `  ON CONFLICT ("run_id", "left_key", "right_key") DO NOTHING\n` +
      `  RETURNING "decision"\n` +
      `)\n` +
      `SELECT count(*) AS inserted,\n` +
      `       count(*) FILTER (WHERE "decision" = 'auto_match') AS auto_match,\n` +
      `       count(*) FILTER (WHERE "decision" = 'grey') AS grey\n` +
      `FROM ins`;

    return {
      sql,
      params: [...droppedKeys, project.organizationId, project.id, run.id, passName, matchAt, rejectAt],
    };
  }

  /**
   * Every comparator of every mapped field, as a JSONB object for the
   * `features` column.
   *
   * One `jsonb_build_object` per field, concatenated with `||`, rather
   * than one call over the whole field map: PostgreSQL's `FUNC_MAX_ARGS`
   * is 100, and a project with 17 `text` fields (three comparators each)
   * would need 102 arguments and be rejected outright. Per field the
   * maximum is six.
   */
  private featuresExpr(fieldMap: FieldMapping[]): string {
    return fieldMap
      .map((field) => {
        const column = assertIdent(field.left, 'field');
        const args = comparatorExprs(field.role, `l."${column}"`, `r."${column}"`)
          .map((comparator) => `'${column}_${assertIdent(comparator.name, 'comparator name')}', ${comparator.sql}`)
          .join(', ');
        return `jsonb_build_object(${args})`;
      })
      .join(' || ');
  }

  /**
   * The field map as this dedupe self-join must read it: both sides name
   * the *same* workspace column.
   *
   * `MaterializeService` creates one column per `fieldMap[].left`, and
   * nothing else. A field map carrying a different `right` (legitimate for
   * a future link-mode project) would make `weightedScoreExpr` emit
   * `r."family_name"` against a table that only has `"surname"`, aborting
   * the pass. `assertScorable` has already refused anything that is not a
   * dedupe project, so collapsing `right` onto `left` here is the dedupe
   * semantics, not a guess.
   */
  private selfJoinFieldMap(project: MatchProject): FieldMapping[] {
    return project.fieldMap.map((field) => ({ ...field, right: field.left }));
  }

  private assertScorable(project: MatchProject, run: MatchRun): void {
    if (project.mode !== 'dedupe') {
      throw new BadRequestException(
        `Phase 1 matching scores dedupe projects only; project ${project.id} is "${project.mode}"`,
      );
    }
    if (run.projectId !== project.id) {
      throw new BadRequestException(`Run ${run.id} does not belong to project ${project.id}`);
    }
    if (run.organizationId !== project.organizationId) {
      throw new BadRequestException(`Run ${run.id} belongs to a different organization than project ${project.id}`);
    }
  }

  /**
   * Validates the project's thresholds before they are bound into a
   * comparison.
   *
   * `thresholds` is JSONB, so the compile-time `number` is not a runtime
   * guarantee. A NaN here is the dangerous case: `score >= 'NaN'` is
   * always false and `score >= NaN` never rejects, so a bad value would
   * silently reclassify an entire run rather than fail.
   */
  private thresholds(project: MatchProject): { matchAt: number; rejectAt: number } {
    const matchAt = this.assertThreshold(project.thresholds?.matchAt, 'matchAt');
    const rejectAt = this.assertThreshold(project.thresholds?.rejectAt, 'rejectAt');
    if (rejectAt > matchAt) {
      throw new BadRequestException(`Threshold rejectAt (${rejectAt}) must not exceed matchAt (${matchAt})`);
    }
    return { matchAt, rejectAt };
  }

  private assertThreshold(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new BadRequestException(`Invalid ${name} threshold: ${JSON.stringify(value)}`);
    }
    return value;
  }

  /** PostgreSQL returns `count(*)` as a string over the wire; parse before any arithmetic. */
  private toCount(value: unknown, what: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Scoring returned a non-numeric ${what}: ${JSON.stringify(value)}`);
    }
    return parsed;
  }
}
