import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export enum AiProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  AZURE = 'azure',
  LOCAL = 'local',
  CUSTOM = 'custom',
}

@Entity('organization_settings')
export class OrganizationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'text' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  // AI Provider Configuration
  @Column({
    name: 'ai_provider',
    type: 'varchar',
    length: 50,
    default: AiProvider.OPENAI,
  })
  aiProvider: AiProvider;

  @Column({ name: 'ai_model', type: 'varchar', length: 100, nullable: true })
  aiModel?: string;

  @Column({ name: 'ai_api_key', type: 'text', nullable: true })
  aiApiKey?: string; // Encrypted

  @Column({ name: 'ai_api_endpoint', type: 'text', nullable: true })
  aiApiEndpoint?: string;

  @Column({ name: 'ai_temperature', type: 'decimal', precision: 3, scale: 2, default: 0.1 })
  aiTemperature: number;

  @Column({ name: 'ai_max_tokens', type: 'integer', default: 2000 })
  aiMaxTokens: number;

  // NL2SQL Settings
  @Column({ name: 'nl2sql_enabled', type: 'boolean', default: true })
  nl2sqlEnabled: boolean;

  @Column({ name: 'nl2sql_include_schema_context', type: 'boolean', default: true })
  nl2sqlIncludeSchemaContext: boolean;

  @Column({ name: 'nl2sql_max_query_length', type: 'integer', default: 1000 })
  nl2sqlMaxQueryLength: number;

  @Column({ name: 'nl2sql_auto_execute', type: 'boolean', default: false })
  nl2sqlAutoExecute: boolean;

  @Column({ name: 'nl2sql_show_reasoning', type: 'boolean', default: true })
  nl2sqlShowReasoning: boolean;

  // Safety Settings
  @Column({ name: 'sql_validation_enabled', type: 'boolean', default: true })
  sqlValidationEnabled: boolean;

  @Column({ name: 'allowed_sql_operations', type: 'simple-array', default: 'SELECT' })
  allowedSqlOperations: string[];

  @Column({ name: 'max_rows_limit', type: 'integer', default: 10000 })
  maxRowsLimit: number;

  // Catalog Integration (OpenMetadata / DataHub)
  // jwtToken inside this JSONB is stored encrypted via EncryptionService
  @Column({ name: 'catalog_config', type: 'jsonb', nullable: true })
  catalogConfig?: {
    provider: 'openmetadata';
    host: string;
    jwtToken: string; // encrypted
    enabled: boolean;
    lastSyncAt?: string;
    lastSyncResult?: { created: number; updated: number; errors: string[] };
  } | null;

  // General Settings
  @Column({ name: 'query_timeout_seconds', type: 'integer', default: 30 })
  queryTimeoutSeconds: number;

  @Column({ name: 'enable_query_history', type: 'boolean', default: true })
  enableQueryHistory: boolean;

  @Column({ name: 'enable_query_sharing', type: 'boolean', default: true })
  enableQuerySharing: boolean;

  // Audit
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @Column({ name: 'updated_by', type: 'text', nullable: true })
  updatedBy?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by' })
  updater?: User;
}
