import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

export type MatchRunStatus =
  | 'pending' | 'materializing' | 'normalizing' | 'blocking'
  | 'scoring' | 'clustering' | 'completed' | 'failed';

export interface MatchRunCounters {
  leftRows: number; rightRows: number; candidatePairs: number;
  /**
   * Ruling R23/R24: of the rows *newly inserted*, those the thresholds
   * labelled `auto_match`. Not a partition of `candidatePairs`: a pair
   * carrying a human verdict is stored as `confirmed`/`rejected` and is
   * counted by neither `autoMatch` nor `grey`, while having left
   * `autoReject` by being inserted. Once any decision exists,
   * `candidatePairs != autoMatch + grey + autoReject`, so a run summary
   * showing those four side by side will visibly fail to add up unless it
   * says so.
   */
  autoMatch: number;
  /** Of the rows newly inserted, those labelled `grey`. Same caveat as `autoMatch`. */
  grey: number;
  /**
   * Ruling R24: candidate pairs seen minus rows newly inserted, summed
   * over the run's passes -- not a count of pairs below `rejectAt`.
   * Because the scoring insert is `ON CONFLICT DO NOTHING`, a pair an
   * earlier pass already stored is counted by a later pass's total but
   * skipped by its insert, and lands here too. Label it "pairs not
   * stored" wherever it is surfaced; see `ScoreResult.autoReject` in
   * `modules/matching/scoring.service.ts`.
   */
  autoReject: number;
  clusters: number; flaggedClusters: number;
  /**
   * Total candidate pairs the blocking estimate projected before the run
   * started. Not a count of anything the run did -- it is recorded so a
   * finished run can be compared against what was projected for it.
   */
  estimatedPairs: number;
  /**
   * Ruling R20: true when any of the run's blocking passes was inexact (a
   * `trigram` pass). `estimatedPairs` is then a LOWER BOUND, not an
   * estimate: the projection counts exactly-equal keys, while a trigram
   * pass proposes every pair above a similarity threshold -- a strict
   * superset. Anything surfacing `estimatedPairs` with this flag set must
   * render it as "at least N pairs" and never as a bare number or a
   * bound. See `BlockingEstimate.hasInexactPass` in
   * `modules/matching/blocking.service.ts`.
   */
  hasInexactPass: boolean;
}

/**
 * One blocking pass's degenerate (dropped) key values, as recorded on the
 * run. A key dropped here is a key whose matches were never proposed, so
 * the record is the only trace of recall the run deliberately gave up --
 * kept per pass, because the same value can be degenerate in one pass and
 * ordinary in another.
 */
export interface RunDroppedKeys { pass: string; keys: string[]; }

@Entity('match_runs')
@Index(['organizationId'])
export class MatchRun {
  @PrimaryColumn('text') id: string;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
  @Column('text', { name: 'project_id' }) projectId: string;
  @Column('text') status: MatchRunStatus;
  @Column('jsonb', { default: () => "'{}'" }) counters: MatchRunCounters;
  @Column('jsonb', { default: () => "'{}'" }) watermarks: Record<string, unknown>;
  @Column('jsonb', { name: 'dropped_keys', default: () => "'[]'" }) droppedKeys: RunDroppedKeys[];
  @CreateDateColumn({ name: 'started_at' }) startedAt: Date;
  @Column('timestamptz', { name: 'finished_at', nullable: true }) finishedAt: Date | null;
  @Column('int', { name: 'duration_ms', nullable: true }) durationMs: number | null;
  @Column('text', { name: 'error_message', nullable: true }) errorMessage: string | null;
}
