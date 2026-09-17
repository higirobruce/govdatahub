import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

export type MatchRunStatus =
  | 'pending' | 'materializing' | 'normalizing' | 'blocking'
  | 'scoring' | 'clustering' | 'completed' | 'failed';

export interface MatchRunCounters {
  leftRows: number; rightRows: number; candidatePairs: number;
  autoMatch: number; grey: number;
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
}

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
  @Column('jsonb', { name: 'dropped_keys', default: () => "'[]'" }) droppedKeys: string[];
  @CreateDateColumn({ name: 'started_at' }) startedAt: Date;
  @Column('timestamptz', { name: 'finished_at', nullable: true }) finishedAt: Date | null;
  @Column('int', { name: 'duration_ms', nullable: true }) durationMs: number | null;
  @Column('text', { name: 'error_message', nullable: true }) errorMessage: string | null;
}
