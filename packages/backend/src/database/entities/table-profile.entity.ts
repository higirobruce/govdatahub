import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Connection } from './connection.entity';
import { Organization } from './organization.entity';

export interface ColumnProfile {
  name: string;
  dataType: string;
  totalRows: number;
  nullCount: number;
  nullPercent: number;
  distinctCount: number;
  distinctPercent: number;
  min?: string;
  max?: string;
  avg?: number;
  stddev?: number;
  minLength?: number;
  maxLength?: number;
  avgLength?: number;
}

@Entity('table_profiles')
export class TableProfile {
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

  @Column('bigint', { nullable: true, name: 'row_count' })
  rowCount: number | null;

  @Column('jsonb', { name: 'column_profiles', default: [] })
  columnProfiles: ColumnProfile[];

  @Column('text', { default: 'running' })
  status: 'running' | 'success' | 'error';

  @Column('text', { nullable: true, name: 'error_message' })
  errorMessage: string | null;

  @Column('integer', { nullable: true, name: 'duration_ms' })
  durationMs: number | null;

  @Column('timestamp', { name: 'profiled_at', default: () => 'NOW()' })
  profiledAt: Date;
}
