export interface ConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
}

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: string; // 'table' | 'view'
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface QueryResult {
  rows: any[];
  rowCount: number;
  fields: Array<{ name: string; type: string }>;
}

export interface DatabaseDriver {
  /**
   * Establish connection to the database
   */
  connect(config: ConnectionConfig): Promise<void>;

  /**
   * Close the database connection
   */
  disconnect(): Promise<void>;

  /**
   * Test if the connection is alive
   */
  testConnection(): Promise<boolean>;

  /**
   * Execute a SQL query
   */
  query(sql: string, params?: any[]): Promise<QueryResult>;

  /**
   * Get list of schemas/databases
   */
  getSchemas(): Promise<SchemaInfo[]>;

  /**
   * Get list of tables in a schema
   */
  getTables(schema?: string): Promise<TableInfo[]>;

  /**
   * Get columns information for a table
   */
  getColumns(table: string, schema?: string): Promise<ColumnInfo[]>;
}
