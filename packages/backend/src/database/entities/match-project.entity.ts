import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Organization } from './organization.entity';

export type MatchMode = 'dedupe' | 'link';
export type FieldRole = 'person_name' | 'org_name' | 'date' | 'phone' | 'identifier' | 'address' | 'text';
export type BlockingKind = 'equi' | 'trigram';

export interface MatchSourceRef {
  kind: 'connection' | 'staged';
  connectionId?: string;
  schemaName?: string;
  tableName?: string;
  stagedDataId?: string;
  primaryKey: string;
}
export interface FieldMapping { left: string; right: string; role: FieldRole; weight: number; comparator: string; }
export interface BlockingPass { name: string; kind: BlockingKind; keyExpr: string; threshold?: number; }
export interface MatchThresholds { matchAt: number; rejectAt: number; }

@Entity('match_projects')
@Index(['organizationId'])
export class MatchProject {
  @PrimaryColumn('text') id: string;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;
  @Column('text') name: string;
  @Column('text', { nullable: true }) description: string | null;
  @Column('text') mode: MatchMode;
  @Column('jsonb', { name: 'left_source' }) leftSource: MatchSourceRef;
  @Column('jsonb', { name: 'right_source', nullable: true }) rightSource: MatchSourceRef | null;
  @Column('jsonb', { name: 'field_map', default: () => "'[]'" }) fieldMap: FieldMapping[];
  @Column('jsonb', { name: 'blocking_passes', default: () => "'[]'" }) blockingPasses: BlockingPass[];
  @Column('jsonb') thresholds: MatchThresholds;
  @Column('text', { name: 'column_allowlist', array: true }) columnAllowlist: string[];
  @Column('text', { name: 'lawful_basis' }) lawfulBasis: string;
  @Column('text', { name: 'data_owner' }) dataOwner: string;
  @Column('int', { name: 'retention_days', default: 30 }) retentionDays: number;
  @Column('text', { default: 'active' }) status: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
