import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Transformation } from './transformation.entity';
import { Organization } from './organization.entity';

@Entity('transformation_runs')
export class TransformationRun {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'transformation_id' })
  transformationId: string;

  @ManyToOne(() => Transformation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transformation_id' })
  transformation: Transformation;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column('text', { name: 'trigger_type' })
  triggerType: 'manual' | 'scheduled';

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column('timestamp', { nullable: true, name: 'completed_at' })
  completedAt: Date | null;

  @Column('int', { nullable: true, name: 'execution_time_ms' })
  executionTimeMs: number | null;

  @Column('int', { nullable: true, name: 'rows_processed' })
  rowsProcessed: number | null;

  @Column('text')
  status: 'running' | 'success' | 'failed' | 'timeout';

  @Column('text', { nullable: true, name: 'error_message' })
  errorMessage: string | null;
}
