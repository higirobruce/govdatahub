import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

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
  @Column('text') decision: CandidateDecision;
  @Column('text', { name: 'user_id', nullable: true }) userId: string | null;
  @Column('double precision', { name: 'prior_score', nullable: true }) priorScore: number | null;
  @Column('jsonb', { name: 'prior_llm_verdict', nullable: true }) priorLlmVerdict: Record<string, unknown> | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
