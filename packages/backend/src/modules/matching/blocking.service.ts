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
  distinctKeys: number;
  estimatedPairs: number;
  droppedKeys: string[];
}

export interface BlockingEstimate {
  perPass: PassEstimate[];
  totalEstimatedPairs: number;
  exceedsCap: boolean;
  refused: boolean;
}

/** One row of a blocking pass's key-frequency histogram, as returned over the wire. */
interface HistogramRow {
  key: string;
  n: string;
}

/**
 * Estimates how many candidate pairs each of a project's blocking passes
 * would propose, and generates the SQL that proposes them.
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
   * R19 -- the bare percentage alone is wrong for small and mid-sized
   * tables; see `DEGENERATE_KEY_FLOOR`). No separate `count(*)` is ever
   * issued; a second round trip per pass is exactly what Ruling P8
   * exists to avoid.
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
      exceedsCap: totalEstimatedPairs > cap,
      refused: totalEstimatedPairs > cap * 2,
    };
  }

  private async estimatePass(table: string, pass: BlockingPass): Promise<PassEstimate> {
    const passName = assertIdent(pass.name, 'blocking pass name');
    const column = assertIdent(`bk_${passName}`, 'blocking pass column name');

    const rows: HistogramRow[] = await this.dataSource.query(
      `SELECT "${column}" AS key, count(*) AS n FROM ${table} GROUP BY "${column}"`,
    );

    // PostgreSQL returns count(*) as a string over the wire -- parse before
    // any arithmetic, or the running total silently concatenates instead
    // of adding.
    const counts = rows.map((r) => ({ key: r.key, n: Number(r.n) }));
    const total = counts.reduce((sum, r) => sum + r.n, 0);
    // Ruling R19: a key must clear both the absolute floor and the
    // percentage share to count as degenerate -- see DEGENERATE_KEY_FLOOR.
    const degenerateAt = Math.max(DEGENERATE_KEY_FLOOR, total * DEGENERATE_KEY_SHARE);

    const droppedKeys: string[] = [];
    let estimatedPairs = 0;
    for (const { key, n } of counts) {
      if (n > degenerateAt) {
        droppedKeys.push(key);
        continue;
      }
      estimatedPairs += (n * (n - 1)) / 2;
    }

    return { pass: passName, distinctKeys: counts.length, estimatedPairs, droppedKeys };
  }

  private maxCandidatePairs(): number {
    const parsed = parseInt(process.env.MATCHING_MAX_CANDIDATE_PAIRS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CANDIDATE_PAIRS;
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
   * A trigram pass is joined on `similarity(...) >= threshold` rather
   * than the pg_trgm `%` operator: `%` is evaluated against the session's
   * `pg_trgm.similarity_threshold` GUC, not a per-call value, so using it
   * correctly for an arbitrary per-pass threshold would require a
   * preceding `SET` statement -- and that can't be folded into this one
   * parameterized string, because PostgreSQL (via the extended query
   * protocol used for bound parameters) refuses multiple statements in a
   * single prepared statement. `similarity(...)` between two column
   * references is correct but, unlike `%` against a constant, cannot be
   * satisfied from the GIN trigram index alone -- it typically costs a
   * sequential-scan-shaped comparison per candidate row. Making a trigram
   * self-join index-accelerated (via a session-level `SET` issued before
   * this query) is Task 15's concern as the executor, not this SQL
   * string's.
   */
  candidatePairsSql(project: MatchProject, pass: BlockingPass, droppedKeys: string[]): string {
    const table = this.materialize.workspaceTable(project.id, 'left');
    const passName = assertIdent(pass.name, 'blocking pass name');
    const column = assertIdent(`bk_${passName}`, 'blocking pass column name');
    const left = `l."${column}"`;
    const right = `r."${column}"`;

    const joinCondition =
      pass.kind === 'trigram'
        ? `similarity(${left}, ${right}) >= ${this.trigramThreshold(pass)}`
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
