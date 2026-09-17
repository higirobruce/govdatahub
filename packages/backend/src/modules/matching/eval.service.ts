import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MatchGoldPair } from '../../database/entities';
import type { MatchProject } from '../../database/entities';

export interface EvalMetrics {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface SweepPoint {
  matchAt: number;
  metrics: EvalMetrics;
}

/** A gold-set label, key-normalized once at load time (see `normalizedKey`). */
interface GoldLabel {
  key: string;
  isMatch: boolean;
}

/** One row `match_candidates` returns for this run. There is no entity for
 * this table (see `ScoringService`, which writes it the same way): it is
 * read here with the identical raw-SQL convention. */
interface CandidateRow {
  left_key: string;
  right_key: string;
  score: unknown;
}

const SWEEP_START = 0.5;
const SWEEP_END = 0.99;
const SWEEP_STEP = 0.01;
// Guards against float drift (e.g. 0.5 + 43 * 0.01 landing on
// 0.9299999999999999) rather than trusting repeated addition.
const SWEEP_DECIMALS = 2;

/**
 * Measures a matching run against a hand-labelled gold set: precision,
 * recall and F1 at one threshold (`evaluate`), or across the full
 * `matchAt` operating range (`sweep`).
 *
 * This is the only place in the pipeline that can answer "why were these
 * two thresholds chosen" -- `matchAt`/`rejectAt` gate every auto-merge and
 * every auto-discard (Ruling context above `ScoringService`), and without
 * a measurement against ground truth they are an unreviewable guess. Zero
 * model calls; phase 1 is dedupe-only.
 */
@Injectable()
export class EvalService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MatchGoldPair) private readonly goldRepo: Repository<MatchGoldPair>,
  ) {}

  /**
   * Precision, recall and F1 for `runId`'s candidates at `matchAt`,
   * measured entirely against `project`'s gold set: every gold pair
   * contributes exactly one of TP/FP/FN/(silent TN), and no candidate
   * outside the gold set is scored, because there is no label to judge it
   * against.
   *
   * A gold pair absent from `match_candidates` -- blocking never proposed
   * it -- is treated exactly like one scored below `matchAt`: not
   * predicted. If the gold label says match, that is a false negative
   * (rule 4 in the brief); if it says non-match, it contributes nothing,
   * same as a correctly-rejected candidate would.
   */
  async evaluate(project: MatchProject, runId: string, matchAt: number): Promise<EvalMetrics> {
    const gold = await this.loadGold(project);
    const candidates = await this.loadCandidates(project, runId);
    return this.score(gold, candidates, matchAt);
  }

  /**
   * The same measurement as `evaluate`, at every `matchAt` from 0.50 to
   * 0.99 in steps of 0.01 (50 points), ascending.
   *
   * The gold set and the candidates are each loaded exactly once, above
   * the loop, and every point below is computed from those two in-memory
   * collections. Fifty round trips per sweep would make the wizard's
   * threshold step unusable -- the same shape of defect this plan has
   * already corrected twice elsewhere (a per-key histogram materializing
   * one object per distinct key, and a guard fetching every internal pair
   * before checking any of them).
   *
   * The output is not smoothed or truncated at the top of the range: a
   * field map with a real gap (Ruling R6 -- an unpopulated phone column
   * caps the achievable score below a 0.9 `matchAt`) must show up here as
   * recall collapsing at the upper thresholds, not be hidden by this
   * method softening what it reports.
   */
  async sweep(project: MatchProject, runId: string): Promise<SweepPoint[]> {
    const gold = await this.loadGold(project);
    const candidates = await this.loadCandidates(project, runId);

    const steps = Math.round((SWEEP_END - SWEEP_START) / SWEEP_STEP) + 1; // 50
    const points: SweepPoint[] = [];
    for (let i = 0; i < steps; i++) {
      const matchAt = this.round(SWEEP_START + i * SWEEP_STEP);
      points.push({ matchAt, metrics: this.score(gold, candidates, matchAt) });
    }
    return points;
  }

  /**
   * Every labelled pair for `project`, normalized to a key that is stable
   * regardless of which side a human wrote first.
   *
   * Throws on an empty gold set: a project with no labels has no
   * measurable quality, and reporting a perfect (or any) score here would
   * be a lie told in the one place this feature is supposed to be
   * defensible.
   */
  private async loadGold(project: MatchProject): Promise<GoldLabel[]> {
    const rows = await this.goldRepo.find({
      where: { organizationId: project.organizationId, projectId: project.id },
    });
    if (!rows || rows.length === 0) {
      throw new BadRequestException(
        `Project ${project.id} has an empty gold set -- label pairs before evaluating matching quality`,
      );
    }
    return rows.map((row) => ({ key: this.normalizedKey(row.leftKey, row.rightKey), isMatch: row.isMatch }));
  }

  /**
   * This run's scored candidates, keyed the same way `loadGold` keys its
   * labels, so a lookup by gold key finds a candidate regardless of which
   * side blocking's self-join guard put first.
   *
   * `match_candidates` has no entity (see `ScoringService`, which writes
   * it via the same raw-SQL convention), so it is read the same way here.
   */
  private async loadCandidates(project: MatchProject, runId: string): Promise<Map<string, number>> {
    const rows: CandidateRow[] = await this.dataSource.query(
      `SELECT "left_key", "right_key", "score" FROM "match_candidates" ` +
        `WHERE "organization_id" = $1 AND "run_id" = $2`,
      [project.organizationId, runId],
    );
    const candidates = new Map<string, number>();
    for (const row of rows ?? []) {
      candidates.set(this.normalizedKey(row.left_key, row.right_key), this.toScore(row.score));
    }
    return candidates;
  }

  /**
   * Confusion-matrix counts and the three derived metrics, computed
   * purely in memory -- no query in this method, so `sweep` can call it
   * fifty times over the same two collections without a single extra
   * round trip.
   *
   * Both divisions are guarded (rule 1 in the brief): `precision` is 0
   * when nothing was predicted (`TP + FP === 0`), `recall` is 0 when the
   * gold set has no positives (`TP + FN === 0`), and `f1` is 0 when
   * precision and recall are both 0. A `NaN` here would not throw -- it
   * would silently poison the wizard's threshold sliders, since every
   * comparison against `NaN` is false and nothing downstream would notice.
   */
  private score(gold: GoldLabel[], candidates: Map<string, number>, matchAt: number): EvalMetrics {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    for (const label of gold) {
      const score = candidates.get(label.key);
      const predicted = score !== undefined && score >= matchAt;
      if (predicted && label.isMatch) {
        truePositives++;
      } else if (predicted && !label.isMatch) {
        falsePositives++;
      } else if (!predicted && label.isMatch) {
        falseNegatives++;
      }
      // !predicted && !isMatch: a true negative. Neither precision, recall
      // nor F1 counts it, so it is intentionally not tracked.
    }

    const precision = truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives);
    const recall = truePositives + falseNegatives === 0 ? 0 : truePositives / (truePositives + falseNegatives);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    return { truePositives, falsePositives, falseNegatives, precision, recall, f1 };
  }

  /**
   * A pair key stable under either ordering of `left`/`right`.
   *
   * `match_candidates` rows are stored with `left_key < right_key` by the
   * self-join guard upstream (`ScoringService`/blocking SQL), but a gold
   * pair was labelled by a human and carries no such guarantee. Sorting
   * both sides before building the key -- the same `least`/`greatest`
   * idea `ScoringService`'s `decisions` CTE uses in SQL, done here in
   * memory -- is what stops a correctly-labelled pair from reading as a
   * miss just because a person wrote it in the other order.
   */
  private normalizedKey(left: string, right: string): string {
    return left < right ? JSON.stringify([left, right]) : JSON.stringify([right, left]);
  }

  /**
   * PostgreSQL can return a numeric column as a string over the wire;
   * `Number()` it before any comparison. A value that does not parse to a
   * finite number throws rather than silently becoming `NaN` -- a `NaN`
   * comparison is always false, which would let a threshold check pass
   * that could not actually be evaluated (the same reasoning
   * `ScoringService.toCount` applies to counts).
   */
  private toScore(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Evaluation read a non-numeric candidate score: ${JSON.stringify(value)}`);
    }
    return parsed;
  }

  /** Rounds to `SWEEP_DECIMALS` places, avoiding float-accumulation drift from repeated addition. */
  private round(value: number): number {
    const factor = 10 ** SWEEP_DECIMALS;
    return Math.round(value * factor) / factor;
  }
}
