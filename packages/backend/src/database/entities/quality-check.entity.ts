import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Connection } from './connection.entity';
import { Organization } from './organization.entity';

export type CheckType =
  | 'not_null'
  | 'unique'
  | 'min_rows'
  | 'max_rows'
  | 'freshness'
  | 'custom_sql';

export type CheckStatus = 'active' | 'inactive';
export type RunStatus = 'pass' | 'fail' | 'error';

@Entity('quality_checks')
export class QualityCheck {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column('text', { name: 'connection_id' })
  connectionId: string;

  @ManyToOne(() => Connection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id' })
  connection: Connection;

  @Column('text', { name: 'schema_name' })
  schemaName: string;

  @Column('text', { name: 'table_name' })
  tableName: string;

  @Column('text', { nullable: true, name: 'column_name' })
  columnName: string | null;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('text', { name: 'check_type' })
  checkType: CheckType;

  @Column('jsonb', { default: {} })
  config: Record<string, any>;

  @Column('text', { default: 'active' })
  status: CheckStatus;

  @Column('timestamp', { nullable: true, name: 'last_run_at' })
  lastRunAt: Date | null;

  @Column('text', { nullable: true, name: 'last_run_status' })
  lastRunStatus: RunStatus | null;

  @Column('double precision', { nullable: true, name: 'last_run_value' })
  lastRunValue: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
