export enum NodeType {
  CONNECTION = 'connection',
  IMPORT_JOB = 'import_job',
  STAGED_DATA = 'staged_data',
  TRANSFORMATION = 'transformation',
  CROSS_QUERY = 'cross_query',
  DATASET_SHARE = 'dataset_share',
}

export enum EdgeType {
  DATA_FLOW = 'data_flow',
  DERIVED_FROM = 'derived_from',
  SHARED_AS = 'shared_as',
}

export interface LineageNode {
  id: string;
  type: NodeType;
  label: string;
  metadata: {
    status?: 'active' | 'paused' | 'completed' | 'failed';
    rowCount?: number;
    lastRunAt?: Date;
    createdAt: Date;
    // Type-specific metadata
    connectionType?: string; // For connections
    sourceType?: string;     // For import jobs
    tableName?: string;      // For staged data
    datasetType?: string;    // For dataset shares
  };
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
  metadata?: {
    rowsProcessed?: number;
    executionTimeMs?: number;
    lastExecutedAt?: Date;
  };
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    generatedAt: Date;
  };
}
