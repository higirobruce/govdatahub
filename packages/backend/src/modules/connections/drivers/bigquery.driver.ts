import { BigQuery, BigQueryOptions } from '@google-cloud/bigquery';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

export class BigQueryDriver implements DatabaseDriver {
  private client: BigQuery | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    try {
      const options: BigQueryOptions = {
        projectId: config.database,
      };

      if (config.keyFile) {
        options.credentials = JSON.parse(config.keyFile);
      }

      this.client = new BigQuery(options);

      // Verify connectivity
      await this.client.getDatasets({ maxResults: 1 });
    } catch (error) {
      this.client = null;
      throw new Error(`BigQuery connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) throw new Error('Not connected');
    try {
      await this.client.getDatasets({ maxResults: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected');

    const [rows, response] = await this.client.query({
      query: sql,
      useLegacySql: false,
    });

    const fields =
      (response as any)?.schema?.fields?.map((f: any) => ({
        name: f.name,
        type: f.type?.toLowerCase() || 'string',
      })) || [];

    return {
      rows,
      rowCount: rows.length,
      fields,
    };
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.client) throw new Error('Not connected');
    const [datasets] = await this.client.getDatasets();
    return datasets.map((d) => ({ name: d.id || '' }));
  }

  async getTables(schema?: string): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected');

    let datasetId = schema;
    if (!datasetId) {
      const [datasets] = await this.client.getDatasets({ maxResults: 1 });
      datasetId = datasets[0]?.id || '';
    }

    const [tables] = await this.client.dataset(datasetId).getTables();
    return tables.map((t) => ({
      schema: datasetId!,
      name: t.id || '',
      type: (t.metadata as any)?.type === 'VIEW' ? 'view' : 'table',
    }));
  }

  async getColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    if (!this.client) throw new Error('Not connected');
    if (!schema) throw new Error('Dataset name required for BigQuery columns');

    const [tableObj] = await this.client.dataset(schema).table(table).get();
    const fields: any[] = (tableObj.metadata as any)?.schema?.fields || [];

    return fields.map((f: any) => ({
      name: f.name,
      type: f.type?.toLowerCase() || 'string',
      nullable: f.mode !== 'REQUIRED',
      defaultValue: null,
      isPrimaryKey: false,
    }));
  }
}
