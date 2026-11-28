import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

/**
 * Ruling R25: what a *person* said about a pair. This is the only
 * vocabulary a reviewer can produce, and the only one `match_decisions`
 * ever holds.
 *
 * Deliberately not `CandidateDecision`. The two were conflated until R25,
 * which meant the scoring join filtered `match_decisions` for candidate
 * states -- values no reviewer can submit -- so every human verdict was
 * invisible and the review queue re-asked every question forever, with no
 * error anywhere to show for it. Keep them apart: a verdict is an input
 * from a human, a candidate decision is a state the pipeline computes.
 */
export type MatchVerdict = 'match' | 'no_match';

/**
 * A candidate pair's state within one run, as stored on
 * `match_candidates.decision`. `auto_match` and `grey` are assigned by the
 * thresholds; `confirmed` and `rejected` are what a `MatchVerdict` of
 * `match` / `no_match` respectively becomes once carried onto a candidate
 * (see `ScoringService`). Never stored on `match_decisions`.
 */
export type CandidateDecision = 'auto_match' | 'grey' | 'confirmed' | 'rejected';

@Entity('match_decisions')
@Index(['organizationId'])
export class MatchDecision {
  @PrimaryColumn('text') id: string;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
  @Column('text', { name: 'project_id' }) projectId: string;
  @Column('text', { name: 'left_source_ref' }) leftSourceRef: string;
  @Column('text', { name: 'left_key' }) leftKey: string;
  @Column('text', { name: 'right_source_ref' }) rightSourceRef: string;
  @Column('text', { name: 'right_key' }) rightKey: string;
  @Column('text') decision: MatchVerdict;
  @Column('text', { name: 'user_id', nullable: true }) userId: string | null;
  @Column('double precision', { name: 'prior_score', nullable: true }) priorScore: number | null;
  @Column('jsonb', { name: 'prior_llm_verdict', nullable: true }) priorLlmVerdict: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
