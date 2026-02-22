import { Client, HttpConnection } from '@elastic/elasticsearch';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

export class ElasticsearchDriver implements DatabaseDriver {
  private client: Client | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const protocol = config.ssl ? 'https' : 'http';
    const node = `${protocol}://${config.host}:${config.port || 9200}`;

    const clientConfig: ConstructorParameters<typeof Client>[0] = {
      node,
      Connection: HttpConnection,
      requestTimeout: 5000,
      maxRetries: 1,
    };

    if (config.username) {
      clientConfig.auth = { username: config.username, password: config.password ?? '' };
    }

    if (config.ssl) {
      clientConfig.tls = { rejectUnauthorized: false };
    }

    try {
      this.client = new Client(clientConfig);
      // Verify connectivity
      const info = await this.client.info();
      if (!info.version?.number) throw new Error('Unexpected response from cluster');
    } catch (error) {
      await this.disconnect();
      throw new Error(`Elasticsearch connection failed: ${error.message}`);
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
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute SQL via the Elasticsearch SQL API.
   * Params are not supported by the ES SQL endpoint — pass them inline.
   */
  async query(sql: string, _params?: any[]): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected');

    try {
      const response = await (this.client.sql as any).query({ query: sql });
      const columns: Array<{ name: string; type: string }> = response.columns ?? [];
      const rawRows: unknown[][] = response.rows ?? [];

      // Convert positional array rows → named-key objects
      const rows = rawRows.map((row) =>
        Object.fromEntries(columns.map((col, i) => [col.name, row[i]])),
      );

      return {
        rows,
        rowCount: rows.length,
        fields: columns.map((c) => ({ name: c.name, type: c.type })),
      };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Elasticsearch has no schema concept — return a single synthetic schema.
   */
  async getSchemas(): Promise<SchemaInfo[]> {
    return [{ name: 'default' }];
  }

  /**
   * Each non-system index is treated as a table.
   */
  async getTables(_schema?: string): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected');

    const response = await this.client.cat.indices({ format: 'json' });
    const records = Array.isArray(response) ? response : (response as any).body ?? [];

    return (records as any[])
      .filter((r) => r.index && !r.index.startsWith('.'))
      .sort((a, b) => a.index.localeCompare(b.index))
      .map((r) => ({ schema: 'default', name: r.index as string, type: 'table' as const }));
  }

  /**
   * Extract fields from the index mapping, flattening nested objects.
   */
  async getColumns(index: string, _schema?: string): Promise<ColumnInfo[]> {
    if (!this.client) throw new Error('Not connected');

    const response = await this.client.indices.getMapping({ index });
    const mappings =
      (response as any)[index]?.mappings ?? (response as any).body?.[index]?.mappings ?? {};
    const properties: Record<string, any> = mappings.properties ?? {};

    return this.flattenProperties(properties);
  }

  // -------------------------------------------------------------------------
  // Flatten nested ES mapping properties into a flat ColumnInfo list
  // -------------------------------------------------------------------------
  private flattenProperties(
    properties: Record<string, any>,
    prefix = '',
  ): ColumnInfo[] {
    const columns: ColumnInfo[] = [];

    for (const [name, mapping] of Object.entries(properties)) {
      const fullName = prefix ? `${prefix}.${name}` : name;

      if (mapping.properties) {
        // Nested / object field — recurse
        columns.push(...this.flattenProperties(mapping.properties, fullName));
      } else {
        columns.push({
          name: fullName,
          type: mapping.type ?? 'object',
          nullable: true,
          defaultValue: null,
          isPrimaryKey: false,
        });
      }
    }

    return columns;
  }
}
