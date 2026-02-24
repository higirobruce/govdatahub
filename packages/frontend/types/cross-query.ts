// Cross-Query Type Definitions

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
export type JoinOperator = '=' | '!=' | '>' | '<' | '>=' | '<=';
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
export type OrderDirection = 'ASC' | 'DESC';

export interface TableReference {
  connectionId: string;
  schemaName: string;
  tableName: string;
  alias: string;
  sourceQuery?: string;
}

export interface JoinCondition {
  leftColumn: string;
  operator: JoinOperator;
  rightColumn: string;
}

export interface JoinDefinition {
  type: JoinType;
  leftTable: string;  // alias
  rightTable: string; // alias
  conditions: JoinCondition[];
}

export interface ColumnSelection {
  table: string;  // alias
  column: string;
  alias?: string;
}

export interface FilterCondition {
  table: string;  // alias
  column: string;
  operator: FilterOperator;
  value?: any;
}

export interface OrderByClause {
  table: string;  // alias
  column: string;
  direction: OrderDirection;
}

export interface QueryDefinition {
  tables: TableReference[];
  joins: JoinDefinition[];
  columns: ColumnSelection[];
  filters?: FilterCondition[];
  orderBy?: OrderByClause[];
  limit?: number;
}

export interface FieldMetadata {
  name: string;
  type: string;
}

export interface CrossQueryResult {
  rows: any[];
  rowCount: number;
  fields: FieldMetadata[];
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

// Table metadata from backend
export interface TableMetadata {
  connectionId: string;
  connectionName: string;
  schemaName: string;
  tableName: string;
  columns: ColumnMetadata[];
}

export interface ColumnMetadata {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
}
