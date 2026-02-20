import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Connection } from './connection.entity';

export enum ImportJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ImportSourceType {
  CSV = 'csv',
  EXCEL = 'excel',
  JSON = 'json',
  PARQUET = 'parquet',
  API = 'api',
  URL = 'url',           // Import from URL
  DATABASE = 'database',  // Import from database connection
  FTP = 'ftp',           // Import from FTP
  SFTP = 'sftp',         // Import from SFTP
}

export enum ImportTargetType {
  STAGING = 'staging',
  DATABASE = 'database',
}

@Entity('import_jobs')
export class ImportJob {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column('text', { name: 'file_name' })
  fileName: string;

  @Column('bigint', { name: 'file_size' })
  fileSize: number;

  @Column({
    type: 'enum',
    enum: ImportSourceType,
    name: 'source_type',
  })
  sourceType: ImportSourceType;

  @Column({
    type: 'enum',
    enum: ImportTargetType,
    name: 'target_type',
  })
  targetType: ImportTargetType;

  @Column('text', { nullable: true, name: 'target_table' })
  targetTable?: string;

  @Column('text', { nullable: true, name: 'connection_id' })
  connectionId?: string;

  @ManyToOne(() => Connection, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connection_id' })
  connection?: Connection;

  @Column({
    type: 'enum',
    enum: ImportJobStatus,
    default: ImportJobStatus.PENDING,
  })
  status: ImportJobStatus;

  @Column('int', { default: 0, name: 'rows_processed' })
  rowsProcessed: number;

  @Column('int', { default: 0, name: 'rows_succeeded' })
  rowsSucceeded: number;

  @Column('int', { default: 0, name: 'rows_failed' })
  rowsFailed: number;

  @Column('jsonb', { nullable: true })
  errors?: any[];

  @Column('jsonb', { nullable: true })
  config?: {
    delimiter?: string; // CSV delimiter
    hasHeader?: boolean; // CSV/Excel header row
    sheetName?: string; // Excel sheet name
    columnMapping?: Record<string, string>; // Source -> Target column mapping
    skipEmptyRows?: boolean;
    trimWhitespace?: boolean;
  };

  // New fields for extended import sources
  @Column('text', { nullable: true, name: 'source_url' })
  sourceUrl?: string; // For URL, API imports

  @Column('text', { nullable: true, name: 'source_connection_id' })
  sourceConnectionId?: string; // For database imports

  @Column('text', { nullable: true, name: 'source_table' })
  sourceTable?: string; // For database imports

  @Column('text', { nullable: true, name: 'import_method' })
  importMethod?: 'manual' | 'scheduled' | 'api'; // How import was triggered

  @Column('jsonb', { nullable: true, name: 'source_config' })
  sourceConfig?: {
    // URL/API auth config
    auth?: {
      type?: 'none' | 'bearer' | 'basic' | 'api_key';
      token?: string;
      username?: string;
      password?: string;
      apiKey?: string;
    };
    headers?: Record<string, string>;
    // Database config
    query?: string;
    whereClause?: string;
    columns?: string[];
    // FTP config
    host?: string;
    port?: number;
    path?: string;
  };

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'completed_at' })
  completedAt?: Date;
}
