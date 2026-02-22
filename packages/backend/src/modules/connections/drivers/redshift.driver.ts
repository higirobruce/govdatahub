import { Pool, PoolClient, QueryResult as PgQueryResult } from 'pg';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

/**
 * Redshift driver - Redshift speaks the PostgreSQL wire protocol,
 * so we can reuse pg with Redshift-compatible schema queries.
 */
export class RedshiftDriver implements DatabaseDriver {
  private pool: Pool | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    try {
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: config.ssl !== false ? { rejectUnauthorized: false } : false,
      });

      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch (error) {
      await this.disconnect();
      throw new Error(`Redshift connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected');
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected');
    try {
      const result: PgQueryResult = params
        ? await this.pool.query(sql, params)
        : await this.pool.query(sql);

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        fields: result.fields.map((field) => ({
          name: field.name,
          type: this.mapType(field.dataTypeID),
        })),
      };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query(`
      SELECT schema_name as name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    return result.rows;
  }

  async getTables(schema: string = 'public'): Promise<TableInfo[]> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query(
      `
      SELECT
        table_schema as schema,
        table_name as name,
        table_type as type
      FROM information_schema.tables
      WHERE table_schema = $1
      ORDER BY table_name
    `,
      [schema],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      type: row.type === 'BASE TABLE' ? 'table' : 'view',
    }));
  }

  async getColumns(table: string, schema: string = 'public'): Promise<ColumnInfo[]> {
    if (!this.pool) throw new Error('Not connected');
    const result = await this.pool.query(
      `
      SELECT
        column_name as name,
        data_type as type,
        is_nullable as nullable,
        column_default as "defaultValue"
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
      [schema, table],
    );

    return result.rows.map((row) => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable === 'YES',
      defaultValue: row.defaultValue,
      isPrimaryKey: false,
    }));
  }

  private mapType(typeId: number): string {
    const typeMap: { [key: number]: string } = {
      16: 'boolean',
      20: 'bigint',
      21: 'smallint',
      23: 'integer',
      25: 'text',
      1043: 'varchar',
      1082: 'date',
      1114: 'timestamp',
      1700: 'numeric',
    };
    return typeMap[typeId] || 'unknown';
  }
}
