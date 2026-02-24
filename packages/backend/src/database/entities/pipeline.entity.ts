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

export interface PipelineStep {
  id: string;
  type: 'ingest' | 'transform' | 'cross-query' | 'export';
  label: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}

export interface PipelineDefinition {
  steps: PipelineStep[];
  edges: PipelineEdge[];
}

@Entity('pipelines')
export class Pipeline {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { default: '' })
  description: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column('text', { name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @Column('text', { nullable: true })
  schedule: string | null;

  @Column('text', { default: 'active' })
  status: 'active' | 'paused';

  @Column('boolean', { name: 'stop_on_error', default: true })
  stopOnError: boolean;

  @Column('jsonb', { default: { steps: [], edges: [] } })
  definition: PipelineDefinition;

  @Column('timestamp', { nullable: true, name: 'last_run_at' })
  lastRunAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
