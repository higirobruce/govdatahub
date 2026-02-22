export type ConnectionType =
  | 'postgresql'
  | 'mysql'
  | 'redshift'
  | 'snowflake'
  | 'bigquery'
  | 'mongodb'
  | 'sqlserver'
  | 'clickhouse'
  | 'sqlite'
  | 'duckdb'
  | 'elasticsearch'
  | 'cassandra';

export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  host?: string;
  port?: number;
  database: string;
  ssl: boolean;
  warehouse?: string;
  createdAt: string;
}

export interface CreateConnectionDto {
  name: string;
  type: ConnectionType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database: string;
  ssl?: boolean;
  // Snowflake-specific
  warehouse?: string;
  // BigQuery-specific
  keyFile?: string;
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

// Cross-Query Types
export interface TableReference {
  connectionId: string;
  schemaName: string;
  tableName: string;
  alias: string;
  columns?: ColumnInfo[];
}

export interface JoinCondition {
  leftColumn: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=';
  rightColumn: string;
}

export interface JoinDefinition {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  leftTable: string;
  rightTable: string;
  conditions: JoinCondition[];
}

export interface ColumnSelection {
  table: string;
  column: string;
  alias?: string;
}

export interface FilterCondition {
  table: string;
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
}

export interface OrderByClause {
  table: string;
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface QueryDefinition {
  tables: TableReference[];
  joins: JoinDefinition[];
  columns: ColumnSelection[];
  filters?: FilterCondition[];
  orderBy?: OrderByClause[];
  limit?: number;
}

export interface CrossQueryResult {
  rows: any[];
  rowCount: number;
  fields: Array<{ name: string; type: string }>;
  executionTimeMs: number;
  generatedSql: string;
}

export interface SavedCrossQuery {
  id: string;
  name: string;
  description?: string;
  queryDefinition: QueryDefinition;
  generatedSql: string;
  organizationId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
