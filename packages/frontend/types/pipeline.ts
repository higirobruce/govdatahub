export type PipelineStepType = 'ingest' | 'transform' | 'cross-query' | 'export';

export interface PipelineStep {
  id: string;
  type: PipelineStepType;
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

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  createdBy: string;
  schedule: string | null;
  status: 'active' | 'paused';
  stopOnError: boolean;
  definition: PipelineDefinition;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StepRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface StepRunResult {
  status: StepRunStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  rowsProcessed?: number;
}

export type PipelineRunStatus = 'running' | 'success' | 'failed' | 'partial';

export interface PipelineRun {
  id: string;
  pipelineId: string;
  organizationId: string;
  triggerType: 'manual' | 'scheduled';
  status: PipelineRunStatus;
  stepResults: Record<string, StepRunResult>;
  startedAt: string;
  completedAt: string | null;
  executionTimeMs: number | null;
  errorMessage: string | null;
}
