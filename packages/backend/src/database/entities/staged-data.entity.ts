import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity('staged_data')
@Index(['organizationId', 'importJobId'])
@Index(['organizationId', 'tableName'])
export class StagedData {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  // Plain text tracking ID — no FK constraint so both file-based import job IDs
  // and pipeline step IDs can be stored here without requiring an ImportJob record.
  @Column('text', { name: 'import_job_id' })
  importJobId: string;

  @Column('text', { name: 'table_name' })
  tableName: string;

  @Column('jsonb')
  schema: any;

  @Column('jsonb')
  data: any;

  @Column('int', { name: 'row_count' })
  rowCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
