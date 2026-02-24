import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Pipeline } from './pipeline.entity';
import { Organization } from './organization.entity';

export interface StepRunResult {
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  error?: string;
  rowsProcessed?: number;
}

@Entity('pipeline_runs')
export class PipelineRun {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'pipeline_id' })
  pipelineId: string;

  @ManyToOne(() => Pipeline, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pipeline_id' })
  pipeline: Pipeline;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column('text', { name: 'trigger_type' })
  triggerType: 'manual' | 'scheduled';

  @Column('text', { default: 'running' })
  status: 'running' | 'success' | 'failed' | 'partial';

  @Column('jsonb', { name: 'step_results', default: {} })
  stepResults: Record<string, StepRunResult>;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column('timestamp', { nullable: true, name: 'completed_at' })
  completedAt: Date | null;

  @Column('int', { nullable: true, name: 'execution_time_ms' })
  executionTimeMs: number | null;

  @Column('text', { nullable: true, name: 'error_message' })
  errorMessage: string | null;
}
