import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { BlockingPass, MatchProject } from '../../database/entities';
import { assertIdent } from './blocking-sql';
import { MaterializeService } from './materialize.service';

/**
 * Ruling P8: a blocking-key value covering more than this share of a
 * pass's own row total makes its join quadratic (the canonical case is an
 * empty surname) and is excluded from the projection entirely.
 */
const DEGENERATE_KEY_SHARE = 0.005;

/**
 * Ruling R19: the percentage alone is wrong for small and mid-sized
 * tables. On a 1,000-row table, 0.5% is five rows -- a surname shared by
 * six people is ordinary data, not degenerate, and dropping it silently
 * loses real matches (the failure is invisible: the pairs simply never
 * get proposed). The floor is justified by what a small key can actually
 * do to the join: a key at exactly this floor contributes
 * `50*49/2 = 1,225` pairs, which is nothing against the
 * `MATCHING_MAX_CANDIDATE_PAIRS` cap (default 250,000,000) -- excluding
 * it buys no protection and only costs recall. Do not tune this number
 * down "to be safer"; above roughly 10,000 rows the percentage term
 * dominates `max()` again on its own, which is the regime Ruling P8 was
 * written for (0.5% of ten million is 50,000 rows sharing one key --
 * unambiguously degenerate).
 */
const DEGENERATE_KEY_FLOOR = 50;

/** Default cap on total projected candidate pairs across all passes; see `MATCHING_MAX_CANDIDATE_PAIRS`. */
const DEFAULT_MAX_CANDIDATE_PAIRS = 250_000_000;

/** Fallback similarity threshold for a trigram pass that omits one. */
const DEFAULT_TRIGRAM_THRESHOLD = 0.3;

export interface PassEstimate {
  pass: string;
  /** Kept keys only (Ruling R22) -- dropped keys are reported separately in `droppedKeys`. */
  distinctKeys: number;
  /**
   * For an `exact` pass, the exact number of pairs the self-join will
   * propose. For an inexact pass (`exact: false` -- always a `trigram`
   * pass, Ruling R20), this is a declared LOWER BOUND only: it counts
   * pairs whose keys are exactly equal, but a trigram pass proposes every
   * pair with `similarity >= threshold`, a strict superset the histogram
   * cannot see. No consumer may present this value for an inexact pass as
   * an estimate of, or a bound on, the real candidate-pair count.
   */
  estimatedPairs: number;
  droppedKeys: string[];
  /** `false` for every `trigram` pass (Ruling R20); `true` for `equi`. */
  exact: boolean;
}

export interface BlockingEstimate {
  perPass: PassEstimate[];
  totalEstimatedPairs: number;
  /** True when any pass reports `exact: false` -- see `PassEstimate.estimatedPairs`. */
  hasInexactPass: boolean;
  exceedsCap: boolean;
  refused: boolean;
}

/**
 * The single row a pass's histogram query returns (Ruling R22): every
 * aggregate PostgreSQL can compute server-side, plus only the key values
 * that actually exceeded the degenerate threshold -- never the full,
 * unbounded per-key histogram.
 */
interface HistogramSummaryRow {
  total_rows: string;
  kept_pairs: string;
  kept_key_count: string;
  dropped_keys: (string | null)[] | null;
}

/**
 * Estimates how many candidate pairs each of a project's blocking passes
 * would propose, and generates the SQL (and its session requirements)
 * that proposes them.
 *
 * Phase 1 is dedupe-only: every pass compares the project's left workspace
 * table with itself (`MaterializeService.workspaceTable(project.id,
 * 'left')`), so there is no right-side handling here at all.
 */
@Injectable()
export class BlockingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly materialize: MaterializeService,
  ) {}

  /**
   * Issues exactly one query per pass -- the key-frequency histogram --
   * and derives everything from it (Ruling P8): the row total is
   * `sum(n)`, the projected pairs are `sum(n*(n-1)/2)` over the keys kept
   * after dropping any that individually cover more than
   * `max(DEGENERATE_KEY_FLOOR, DEGENERATE_KEY_SHARE * total)` (Ruling
   * R19). The aggregation happens server-side and only the kept totals
   * plus the (bounded, ~200-row) list of dropped key values ever cross
   * the wire (Ruling R22) -- not one row per distinct key, which would be
   * the table's own row count for a high-cardinality key. No separate
   * `count(*)` is ever issued; a second round trip per pass is exactly
   * what Ruling P8 exists to avoid.
   *
   * A trigram pass's `estimatedPairs` is a declared lower bound, not an
   * estimate (Ruling R20, see `PassEstimate.exact`): the histogram can
   * only count exact-key matches, and a trigram pass's real join proposes
   * a strict superset of those. `hasInexactPass` surfaces that so a
   * caller cannot mistake a near-zero projection on a near-unique
   * trigram key for a cleared gate.
   */
  async estimate(project: MatchProject): Promise<BlockingEstimate> {
    const table = this.materialize.workspaceTable(project.id, 'left');
    const perPass: PassEstimate[] = [];
    for (const pass of project.blockingPasses) {
      perPass.push(await this.estimatePass(table, pass));
    }

    const totalEstimatedPairs = perPass.reduce((sum, p) => sum + p.estimatedPairs, 0);
    const cap = this.maxCandidatePairs();

    return {
      perPass,
      totalEstimatedPairs,
      hasInexactPass: perPass.some((p) => !p.exact),
      exceedsCap: totalEstimatedPairs > cap,
      refused: totalEstimatedPairs > cap * 2,
    };
  }

  private async estimatePass(table: string, pass: BlockingPass): Promise<PassEstimate> {
    const passName = assertIdent(pass.name, 'blocking pass name');
    const column = assertIdent(`bk_${passName}`, 'blocking pass column name');

    const rows: HistogramSummaryRow[] = await this.dataSource.query(this.histogramSummarySql(table, column));
    const summary = rows[0];

    // Counts and sums come back from PostgreSQL as strings over the wire --
    // parse before any arithmetic, or they silently concatenate instead of
    // adding.
    const estimatedPairs = summary ? Number(summary.kept_pairs) : 0;
    const distinctKeys = summary ? Number(summary.kept_key_count) : 0;
    // Defensive even though the workspace's field columns are guaranteed
    // never-null: a single NULL surviving into a NOT IN (...) list makes
    // that predicate UNKNOWN for every row, silently zeroing every pair
    // the query would otherwise have proposed. The SQL itself also
    // excludes NULL keys from dropped_keys; this is a second, cheap line
    // of defence against the one failure mode that is both total and
    // silent.
    const droppedKeys = (summary?.dropped_keys ?? []).filter((key): key is string => key !== null);

    return { pass: passName, distinctKeys, estimatedPairs, droppedKeys, exact: pass.kind !== 'trigram' };
  }

  /**
   * Builds the one histogram query for a pass (Ruling R22). The
   * per-distinct-key rows never leave PostgreSQL: `histogram` groups them,
   * `totals` reduces that to a single row total, `threshold` derives the
   * degenerate cutoff from it, and the final `SELECT` returns exactly one
   * row carrying the kept-key pair sum, the kept-key count, and the
   * (bounded) list of key values that exceeded the cutoff. A key must
   * exceed `max(50, 0.5% of total)` to appear in `dropped_keys` at all, so
   * that array is bounded to roughly `total / 50` entries in the worst
   * case -- nowhere near the row count a naive per-key histogram would
   * return on a high-cardinality key.
   */
  private histogramSummarySql(table: string, column: string): string {
    return (
      `WITH histogram AS (` +
      `SELECT "${column}" AS key, count(*) AS n FROM ${table} GROUP BY "${column}"` +
      `), totals AS (` +
      `SELECT coalesce(sum(n), 0) AS total_rows FROM histogram` +
      `), threshold AS (` +
      `SELECT GREATEST(${DEGENERATE_KEY_FLOOR}, total_rows * ${DEGENERATE_KEY_SHARE}) AS cutoff FROM totals` +
      `) ` +
      `SELECT totals.total_rows AS total_rows, ` +
      `coalesce(sum(h.n * (h.n - 1) / 2) FILTER (WHERE h.n <= threshold.cutoff), 0) AS kept_pairs, ` +
      `count(*) FILTER (WHERE h.n <= threshold.cutoff) AS kept_key_count, ` +
      `coalesce(array_agg(h.key) FILTER (WHERE h.n > threshold.cutoff AND h.key IS NOT NULL), ARRAY[]::text[]) AS dropped_keys ` +
      `FROM histogram h, totals, threshold ` +
      `GROUP BY totals.total_rows, threshold.cutoff`
    );
  }

  private maxCandidatePairs(): number {
    const parsed = parseInt(process.env.MATCHING_MAX_CANDIDATE_PAIRS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CANDIDATE_PAIRS;
  }

  /**
   * Statements a caller must execute in the same transaction/session
   * before running `candidatePairsSql` for this pass (Ruling R21).
   *
   * The `%` operator this method's SQL counterpart emits for a `trigram`
   * pass is governed by the session GUC `pg_trgm.similarity_threshold`,
   * not a per-call argument. If that GUC sits above the pass's own
   * threshold, `%` -- the index-scannable predicate -- silently filters
   * out pairs that the `similarity(...) >= threshold` recheck in the same
   * query would otherwise have kept, shrinking the result set without any
   * error. Returning the fix as data, not prose, makes it mechanical: an
   * executor that skips this array is skipping a returned instruction,
   * not forgetting an unwritten one.
   */
  passSessionSettings(pass: BlockingPass): string[] {
    if (pass.kind !== 'trigram') return [];
    return [`SET LOCAL pg_trgm.similarity_threshold = ${this.trigramThreshold(pass)}`];
  }

  /**
   * Builds the SQL that proposes one blocking pass's candidate pairs, as a
   * dedupe self-join over the project's left workspace table aliased as
   * both `l` and `r`.
   *
   * `l."src_key" < r."src_key"` is the single most consequential line in
   * this method: without it, a self-join on the shared key produces every
   * pair twice (both orderings) and matches every record with itself.
   *
   * Dropped (degenerate) key values are excluded via a bound-parameter
   * `NOT IN` list on both sides of the join -- never interpolated into the
   * SQL text -- and the clause is omitted entirely when there is nothing
   * to drop: `NOT IN ()` with an empty literal list is a SQL syntax error
   * in PostgreSQL, not a no-op, so an empty `droppedKeys` must change the
   * shape of the query, not just its bound values. The placeholders start
   * at `$1`; the caller is expected to pass `droppedKeys` as the query
   * parameters in the same order.
   *
   * A trigram pass is joined on **both** `l.col % r.col` and
   * `similarity(l.col, r.col) >= threshold` (Ruling R21). `similarity()`
   * alone is a plain function call in the join predicate -- only `%`,
   * `<%` and `<->` map to `gin_trgm_ops`, so `similarity()` alone cannot
   * use the GIN trigram index the materializer builds, and the planner
   * falls back to a full self cross-product that is correct but never
   * returns at real scale. `%` supplies the index-scannable predicate;
   * `similarity()` stays as an exact recheck at the pass's own threshold,
   * so the result set is unchanged. `%`'s threshold comes from the
   * session GUC `pg_trgm.similarity_threshold`, not this call -- see
   * `passSessionSettings`, which the caller must run first in the same
   * session/transaction, or the index predicate can silently disagree
   * with the recheck.
   */
  candidatePairsSql(project: MatchProject, pass: BlockingPass, droppedKeys: string[]): string {
    const table = this.materialize.workspaceTable(project.id, 'left');
    const passName = assertIdent(pass.name, 'blocking pass name');
    const column = assertIdent(`bk_${passName}`, 'blocking pass column name');
    const left = `l."${column}"`;
    const right = `r."${column}"`;

    const joinCondition =
      pass.kind === 'trigram'
        ? `${left} % ${right} AND similarity(${left}, ${right}) >= ${this.trigramThreshold(pass)}`
        : `${left} = ${right}`;

    const exclude = this.excludeDroppedKeysSql(left, right, droppedKeys);

    return (
      `SELECT l."src_key" AS left_key, r."src_key" AS right_key ` +
      `FROM ${table} l JOIN ${table} r ON ${joinCondition} AND l."src_key" < r."src_key"${exclude}`
    );
  }

  private excludeDroppedKeysSql(left: string, right: string, droppedKeys: string[]): string {
    if (droppedKeys.length === 0) return '';
    const placeholders = droppedKeys.map((_, i) => `$${i + 1}`).join(', ');
    // Filtered on both sides: for an `equi` pass this is redundant with the
    // join's equality (if l's key is excluded, r's equal key already is
    // too), but a `trigram` pass's two sides are similar, not equal, so
    // either side alone could still smuggle a degenerate value through.
    return ` AND ${left} NOT IN (${placeholders}) AND ${right} NOT IN (${placeholders})`;
  }

  private trigramThreshold(pass: BlockingPass): number {
    if (pass.threshold === undefined) return DEFAULT_TRIGRAM_THRESHOLD;
    if (typeof pass.threshold !== 'number' || !Number.isFinite(pass.threshold) || pass.threshold <= 0 || pass.threshold > 1) {
      throw new BadRequestException(
        `Invalid similarity threshold for trigram blocking pass "${pass.name}": ${JSON.stringify(pass.threshold)}`,
      );
    }
    return pass.threshold;
  }
}
