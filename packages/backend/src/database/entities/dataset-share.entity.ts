import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export type DatasetType = 'staged' | 'connection' | 'transformation' | 'cross-query';
export type ShareAccessLevel = 'public' | 'organization' | 'private';

@Entity('dataset_shares')
export class DatasetShare {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text')
  description: string;

  @Column('text', { name: 'dataset_type' })
  datasetType: DatasetType;

  @Column('text', { name: 'dataset_id' })
  datasetId: string; // References staged_data.id, connection.id, transformation.id, or saved_cross_query.id

  @Column('text', { name: 'table_name', nullable: true })
  tableName?: string; // For staged data or connection tables

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'created_by' })
  createdBy: string;

  @Column('text', { name: 'access_level', default: 'private' })
  accessLevel: ShareAccessLevel;

  @Column('text', { name: 'share_token', nullable: true })
  shareToken?: string; // For public/external sharing

  @Column('text', { name: 'api_key', nullable: true })
  apiKey?: string; // For API access

  @Column('boolean', { default: true })
  active: boolean;

  @Column('integer', { name: 'row_count', nullable: true })
  rowCount?: number;

  @Column('text', { nullable: true })
  schema?: string; // JSON schema of the dataset

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column('timestamp', { name: 'last_accessed_at', nullable: true })
  lastAccessedAt?: Date;

  @Column('integer', { name: 'access_count', default: 0 })
  accessCount: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;
}
