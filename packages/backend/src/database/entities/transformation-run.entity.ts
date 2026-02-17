import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('transformation_runs')
export class TransformationRun {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'transformation_id' })
  transformationId: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'trigger_type' })
  triggerType: string; // 'manual' | 'scheduled'

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column('timestamp', { nullable: true, name: 'completed_at' })
  completedAt: Date;

  @Column('int', { nullable: true, name: 'execution_time_ms' })
  executionTimeMs: number;

  @Column('int', { nullable: true, name: 'rows_processed' })
  rowsProcessed: number;

  @Column('text')
  status: string; // 'running' | 'success' | 'failed' | 'timeout'

  @Column('text', { nullable: true, name: 'error_message' })
  errorMessage: string;
}
