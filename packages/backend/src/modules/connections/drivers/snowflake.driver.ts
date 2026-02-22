import * as snowflake from 'snowflake-sdk';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

export class SnowflakeDriver implements DatabaseDriver {
  private connection: snowflake.Connection | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const connOptions: snowflake.ConnectionOptions = {
      account: config.host,
      username: config.username,
      password: config.password,
      database: config.database,
    };

    if (config.warehouse) {
      connOptions.warehouse = config.warehouse;
    }

    const conn = snowflake.createConnection(connOptions);

    await new Promise<void>((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(new Error(`Snowflake connection failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });

    this.connection = conn;
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await new Promise<void>((resolve) => {
        this.connection!.destroy((err) => {
          if (err) {
            // Best-effort disconnect; don't throw
            console.warn('Snowflake disconnect warning:', err.message);
          }
          resolve();
        });
      });
      this.connection = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.connection) throw new Error('Not connected');
    try {
      await this.executeRaw('SELECT 1 AS test');
      return true;
    } catch {
      return false;
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.connection) throw new Error('Not connected');
    return this.executeRaw(sql);
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    const result = await this.executeRaw(`
      SELECT SCHEMA_NAME
      FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME != 'INFORMATION_SCHEMA'
      ORDER BY SCHEMA_NAME
    `);
    return result.rows.map((row) => ({ name: row['SCHEMA_NAME'] || row['schema_name'] }));
  }

  async getTables(schema: string = 'PUBLIC'): Promise<TableInfo[]> {
    const result = await this.executeRaw(`
      SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = '${schema.toUpperCase()}'
      ORDER BY TABLE_NAME
    `);
    return result.rows.map((row) => ({
      schema: row['TABLE_SCHEMA'] || row['table_schema'] || schema,
      name: row['TABLE_NAME'] || row['table_name'],
      type: (row['TABLE_TYPE'] || row['table_type']) === 'BASE TABLE' ? 'table' : 'view',
    }));
  }

  async getColumns(table: string, schema: string = 'PUBLIC'): Promise<ColumnInfo[]> {
    const result = await this.executeRaw(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = '${schema.toUpperCase()}'
        AND TABLE_NAME = '${table.toUpperCase()}'
      ORDER BY ORDINAL_POSITION
    `);
    return result.rows.map((row) => ({
      name: row['COLUMN_NAME'] || row['column_name'],
      type: (row['DATA_TYPE'] || row['data_type'])?.toLowerCase() || 'text',
      nullable: (row['IS_NULLABLE'] || row['is_nullable']) === 'YES',
      defaultValue: row['COLUMN_DEFAULT'] || row['column_default'] || null,
      isPrimaryKey: false,
    }));
  }

  private executeRaw(sql: string): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      if (!this.connection) return reject(new Error('Not connected'));

      this.connection.execute({
        sqlText: sql,
        complete: (err, stmt, rows) => {
          if (err) {
            return reject(new Error(`Query execution failed: ${err.message}`));
          }
          const columns = stmt.getColumns();
          resolve({
            rows: rows || [],
            rowCount: rows?.length || 0,
            fields: columns?.map((col) => ({
              name: col.getName(),
              type: col.getType()?.toLowerCase() || 'text',
            })) || [],
          });
        },
      });
    });
  }
}
