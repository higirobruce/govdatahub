import { createClient, ClickHouseClient } from '@clickhouse/client';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

export class ClickHouseDriver implements DatabaseDriver {
  private client: ClickHouseClient | null = null;
  private database: string = 'default';

  async connect(config: ConnectionConfig): Promise<void> {
    this.database = config.database || 'default';

    try {
      this.client = createClient({
        url: `http${config.ssl ? 's' : ''}://${config.host}:${config.port || 8123}`,
        username: config.username || 'default',
        password: config.password || '',
        database: this.database,
        request_timeout: 5000,
        clickhouse_settings: { connect_timeout: 5 },
      });

      // Verify connection
      const ping = await this.client.ping();
      if (!ping.success) throw new Error('Ping failed');
    } catch (error) {
      await this.disconnect();
      throw new Error(`ClickHouse connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) throw new Error('Not connected');
    try {
      const result = await this.client.ping();
      return result.success;
    } catch {
      return false;
    }
  }

  async query(sql: string, _params?: any[]): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected');

    try {
      const result = await this.client.query({ query: sql, format: 'JSONEachRow' });
      const rows = await result.json<any[]>();

      const fields =
        rows.length > 0
          ? Object.keys(rows[0]).map((name) => ({
              name,
              type: typeof rows[0][name],
            }))
          : [];

      return { rows, rowCount: rows.length, fields };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.client) throw new Error('Not connected');

    const result = await this.client.query({
      query: 'SELECT name FROM system.databases ORDER BY name',
      format: 'JSONEachRow',
    });
    const rows = (await result.json()) as Array<{ name: string }>;

    return rows
      .filter((r) => !['system', 'information_schema', 'INFORMATION_SCHEMA'].includes(r.name))
      .map((r) => ({ name: r.name }));
  }

  async getTables(schema?: string): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected');

    const db = schema ?? this.database;
    const result = await this.client.query({
      query: `
        SELECT name, engine
        FROM system.tables
        WHERE database = {db: String}
          AND is_temporary = 0
        ORDER BY name
      `,
      query_params: { db },
      format: 'JSONEachRow',
    });

    const rows = (await result.json()) as Array<{ name: string; engine: string }>;

    return rows.map((r) => ({
      schema: db,
      name: r.name,
      type: r.engine.toLowerCase().includes('view') ? 'view' : 'table',
    }));
  }

  async getColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    if (!this.client) throw new Error('Not connected');

    const db = schema ?? this.database;
    const result = await this.client.query({
      query: `
        SELECT
          name,
          type,
          default_expression,
          is_in_primary_key
        FROM system.columns
        WHERE database = {db: String} AND table = {table: String}
        ORDER BY position
      `,
      query_params: { db, table },
      format: 'JSONEachRow',
    });

    const rows = (await result.json()) as Array<{
      name: string;
      type: string;
      default_expression: string;
      is_in_primary_key: number;
    }>;

    return rows.map((r) => ({
      name: r.name,
      type: r.type,
      nullable: r.type.startsWith('Nullable('),
      defaultValue: r.default_expression || null,
      isPrimaryKey: r.is_in_primary_key === 1,
    }));
  }
}
