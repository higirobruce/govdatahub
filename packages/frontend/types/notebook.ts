export type CellType = 'sql' | 'markdown';
export type CellStatus = 'idle' | 'running' | 'success' | 'error';

export interface CellResult {
  rows: any[];
  rowCount: number;
  fields: Array<{ name: string; type: string }>;
  executionTimeMs: number;
}

export interface PersistedCell {
  id: string;
  type: CellType;
  content: string;
  connectionId?: string;
  order: number;
}

/** Client-only runtime state — never sent to the API */
export interface CellRuntimeState {
  status: CellStatus;
  result: CellResult | null;
  error: string | null;
}

export interface Notebook {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  createdBy: string;
  cells: PersistedCell[];
  createdAt: string;
  updatedAt: string;
}
