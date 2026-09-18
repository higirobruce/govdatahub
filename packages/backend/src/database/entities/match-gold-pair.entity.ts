import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

/**
 * One hand-labelled verdict against `match_gold_pairs`: whether `leftKey`
 * and `rightKey` are the same real-world entity, decided by a person, not
 * the pipeline. `EvalService` is the only reader -- this is the ground
 * truth precision, recall and F1 are measured against, never a candidate
 * pair the scoring/clustering stages themselves produced.
 *
 * `left_key`/`right_key` carry no ordering guarantee: a gold pair is
 * labelled by a human and can name either side first, unlike
 * `match_candidates`, where the self-join guard fixes `left_key < right_key`
 * (see `ScoringService`/`BlockingService`). Callers must normalize both
 * sides before comparing a gold pair against a candidate.
 */
@Entity('match_gold_pairs')
@Index(['organizationId'])
export class MatchGoldPair {
  @PrimaryColumn('text') id: string;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
  @Column('text', { name: 'project_id' }) projectId: string;
  @Column('text', { name: 'left_key' }) leftKey: string;
  @Column('text', { name: 'right_key' }) rightKey: string;
  @Column('boolean', { name: 'is_match' }) isMatch: boolean;
  @Column('text', { name: 'labelled_by', nullable: true }) labelledBy: string | null;
  @CreateDateColumn({ name: 'labelled_at' }) labelledAt: Date;
}
