import * as cassandra from 'cassandra-driver';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

/** System keyspaces to hide from the schema browser */
const SYSTEM_KEYSPACES = new Set([
  'system',
  'system_auth',
  'system_distributed',
  'system_schema',
  'system_traces',
  'system_views',
  'system_virtual_schema',
]);

export class CassandraDriver implements DatabaseDriver {
  private client: cassandra.Client | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const contactPoint = config.port
      ? `${config.host}:${config.port}`
      : config.host;

    const options: cassandra.ClientOptions = {
      contactPoints: [contactPoint],
      socketOptions: { connectTimeout: 5000, readTimeout: 30000 },
      // localDataCenter is intentionally omitted — the driver auto-detects it
      // from the first responsive contact point (logs a warning, still works).
    };

    if (config.database) options.keyspace = config.database;

    if (config.username) {
      options.credentials = {
        username: config.username,
        password: config.password ?? '',
      };
    }

    if (config.ssl) {
      options.sslOptions = { rejectUnauthorized: false };
    }

    try {
      this.client = new cassandra.Client(options);
      await this.client.connect();
    } catch (error) {
      await this.disconnect();
      throw new Error(`Cassandra connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
      this.client = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) throw new Error('Not connected');
    try {
      await this.client.execute('SELECT release_version FROM system.local');
      return true;
    } catch {
      return false;
    }
  }

  async query(cql: string, params?: any[]): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected');

    try {
      const result = await this.client.execute(cql, params ?? [], { prepare: true });
      const columns = result.columns ?? [];

      const fields = columns.map((col) => ({
        name: col.name,
        type: this.mapCqlTypeCode(col.type.code),
      }));

      const rows = result.rows.map((row) =>
        Object.fromEntries(columns.map((col) => [col.name, row.get(col.name)])),
      );

      return { rows, rowCount: result.rowLength, fields };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.client) throw new Error('Not connected');

    const result = await this.client.execute(
      `SELECT keyspace_name FROM system_schema.keyspaces`,
    );

    return result.rows
      .map((r) => r.get('keyspace_name') as string)
      .filter((name) => !SYSTEM_KEYSPACES.has(name))
      .sort()
      .map((name) => ({ name }));
  }

  async getTables(schema?: string): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected');
    if (!schema) throw new Error('A keyspace (schema) name is required');

    const result = await this.client.execute(
      `SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?`,
      [schema],
      { prepare: true },
    );

    return result.rows
      .map((r) => r.get('table_name') as string)
      .sort()
      .map((name) => ({ schema, name, type: 'table' as const }));
  }

  async getColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    if (!this.client) throw new Error('Not connected');
    if (!schema) throw new Error('A keyspace (schema) name is required');

    const result = await this.client.execute(
      `SELECT column_name, type, kind
       FROM system_schema.columns
       WHERE keyspace_name = ? AND table_name = ?`,
      [schema, table],
      { prepare: true },
    );

    return result.rows.map((r) => ({
      name: r.get('column_name') as string,
      type: r.get('type') as string,
      nullable: (r.get('kind') as string) === 'regular',
      defaultValue: null,
      isPrimaryKey:
        (r.get('kind') as string) === 'partition_key' ||
        (r.get('kind') as string) === 'clustering',
    }));
  }

  // -------------------------------------------------------------------------
  // Map CQL type code numbers to human-readable names
  // -------------------------------------------------------------------------
  private mapCqlTypeCode(code: number): string {
    const cqlTypes: Record<number, string> = {
      0x0000: 'custom',
      0x0001: 'ascii',
      0x0002: 'bigint',
      0x0003: 'blob',
      0x0004: 'boolean',
      0x0005: 'counter',
      0x0006: 'decimal',
      0x0007: 'double',
      0x0008: 'float',
      0x0009: 'int',
      0x000a: 'text',
      0x000b: 'timestamp',
      0x000c: 'uuid',
      0x000d: 'varchar',
      0x000e: 'varint',
      0x000f: 'timeuuid',
      0x0010: 'inet',
      0x0011: 'date',
      0x0012: 'time',
      0x0013: 'smallint',
      0x0014: 'tinyint',
      0x0015: 'duration',
      0x0020: 'list',
      0x0021: 'map',
      0x0022: 'set',
      0x0030: 'udt',
      0x0031: 'tuple',
    };
    return cqlTypes[code] ?? 'unknown';
  }
}
