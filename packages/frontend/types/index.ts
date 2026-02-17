export interface Connection {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql';
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  createdAt: string;
}

export interface CreateConnectionDto {
  name: string;
  type: 'postgresql' | 'mysql';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: 'table' | 'view';
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface ExecuteQueryDto {
  connectionId: string;
  sql: string;
  cacheResults?: boolean;
}

export interface QueryResult {
  id: string;
  rows: any[];
  rowCount: number;
  fields: Array<{ name: string; type: string }>;
  executionTimeMs: number;
  status: string;
}

export interface QueryHistory {
  id: string;
  connectionId: string;
  sqlQuery: string;
  executedAt: string;
  executionTimeMs: number;
  rowCount: number;
  status: string;
  errorMessage?: string;
}
