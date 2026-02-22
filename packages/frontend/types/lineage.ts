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
    lastRunAt?: string;
    createdAt: string;
    connectionType?: string;
    sourceType?: string;
    tableName?: string;
    datasetType?: string;
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
    lastExecutedAt?: string;
  };
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  metadata: {
    totalNodes: number;
    totalEdges: number;
    generatedAt: string;
  };
}

export interface LineageQueryParams {
  nodeTypes?: NodeType[];
  datasetId?: string;
  direction?: 'upstream' | 'downstream' | 'both';
  startDate?: string;
  endDate?: string;
  maxDepth?: number;
}
