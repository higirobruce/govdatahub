import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

export interface MatchMember { sourceRef: string; sourceKey: string; }

@Entity('match_entities')
@Index(['organizationId'])
export class MatchEntity {
  @PrimaryColumn('text') id: string;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
  @Column('text', { name: 'project_id' }) projectId: string;
  @Column('text', { name: 'run_id' }) runId: string;
  @Column('text', { name: 'entity_key' }) entityKey: string;
  @Column('jsonb', { default: () => "'[]'" }) members: MatchMember[];
  @Column('jsonb', { default: () => "'{}'" }) golden: Record<string, unknown>;
  @Column('int') size: number;
  @Column('boolean', { default: false }) flagged: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
