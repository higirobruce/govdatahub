import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

/**
 * DuckDB driver using @duckdb/node-api.
 *
 * The `database` field holds the file path (or `:memory:`).
 * Host, port, username, and password are ignored — DuckDB is an in-process engine.
 * DuckDB uses $1, $2, ... positional parameters in SQL.
 */
export class DuckDBDriver implements DatabaseDriver {
  private instance: DuckDBInstance | null = null;
  private connection: DuckDBConnection | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const filePath = config.database || ':memory:';

    try {
      this.instance = await DuckDBInstance.create(filePath);
      this.connection = await this.instance.connect();
      await this.runQuery('SELECT 1 AS ok');
    } catch (error) {
      await this.disconnect();
      throw new Error(`DuckDB connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.connection?.closeSync();
    } catch {
      // Ignore close errors
    }
    try {
      this.instance?.closeSync();
    } catch {
      // Ignore close errors
    }
    this.connection = null;
    this.instance = null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.connection) throw new Error('Not connected');
    try {
      await this.runQuery('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    }
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    const rows = await this.runQuery(sql, params);
    const fields =
      rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({ name, type: typeof rows[0][name] }))
        : [];
    return { rows, rowCount: rows.length, fields };
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    const rows = await this.runQuery(`
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schema_name
    `);
    return rows.map((r) => ({ name: r.name as string }));
  }

  async getTables(schema: string = 'main'): Promise<TableInfo[]> {
    const rows = await this.runQuery(
      `SELECT
         table_schema AS "schema",
         table_name   AS name,
         table_type   AS type
       FROM information_schema.tables
       WHERE table_schema = $1
       ORDER BY table_name`,
      [schema],
    );
    return rows.map((r) => ({
      schema: r.schema as string,
      name: r.name as string,
      type: (r.type as string) === 'BASE TABLE' ? 'table' : 'view',
    }));
  }

  async getColumns(table: string, schema: string = 'main'): Promise<ColumnInfo[]> {
    const cols = await this.runQuery(
      `SELECT
         column_name    AS name,
         data_type      AS type,
         is_nullable    AS nullable,
         column_default AS "defaultValue"
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table],
    );

    let pkSet = new Set<string>();
    try {
      const pkRows = await this.runQuery(
        `SELECT UNNEST(constraint_column_names) AS col_name
         FROM duckdb_constraints()
         WHERE constraint_type = 'PRIMARY KEY'
           AND schema_name = $1 AND table_name = $2`,
        [schema, table],
      );
      pkSet = new Set(pkRows.map((r) => r.col_name as string));
    } catch {
      // Views or older builds may not expose constraints
    }

    return cols.map((r) => ({
      name: r.name as string,
      type: r.type as string,
      nullable: r.nullable === 'YES',
      defaultValue: (r.defaultValue as string) ?? null,
      isPrimaryKey: pkSet.has(r.name as string),
    }));
  }

  // -------------------------------------------------------------------------
  // Internal helper — executes a query and returns plain row objects
  // -------------------------------------------------------------------------
  private async runQuery(sql: string, params?: any[]): Promise<Record<string, unknown>[]> {
    if (!this.connection) throw new Error('Not connected');

    let reader: Awaited<ReturnType<DuckDBConnection['run']>>;

    if (params && params.length > 0) {
      const prepared = await this.connection.prepare(sql);
      for (let i = 0; i < params.length; i++) {
        prepared.bindValue(i + 1, params[i]);
      }
      reader = await prepared.run();
    } else {
      reader = await this.connection.run(sql);
    }

    const columnNames: string[] = reader.columnNames();
    const rows: Record<string, unknown>[] = [];

    let chunk = await reader.fetchChunk();
    while (chunk && chunk.rowCount > 0) {
      for (let rowIdx = 0; rowIdx < chunk.rowCount; rowIdx++) {
        const row: Record<string, unknown> = {};
        for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
          row[columnNames[colIdx]] = chunk.getColumnValues(colIdx)[rowIdx];
        }
        rows.push(row);
      }
      chunk = await reader.fetchChunk();
    }

    return rows;
  }
}
