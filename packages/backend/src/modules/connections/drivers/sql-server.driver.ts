import * as sql from 'mssql';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

export class SqlServerDriver implements DatabaseDriver {
  private pool: sql.ConnectionPool | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const sqlConfig: sql.config = {
      server: config.host,
      port: config.port || 1433,
      user: config.username,
      password: config.password,
      database: config.database,
      options: {
        encrypt: config.ssl ?? true,
        trustServerCertificate: true,
        connectTimeout: 5000,
        requestTimeout: 30000,
      },
      pool: {
        max: 5,
        idleTimeoutMillis: 30000,
      },
    };

    try {
      this.pool = new sql.ConnectionPool(sqlConfig);
      await this.pool.connect();
    } catch (error) {
      await this.disconnect();
      throw new Error(`SQL Server connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected');
    try {
      await this.pool.request().query('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    }
  }

  async query(sqlStr: string, params?: any[]): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected');

    try {
      const request = this.pool.request();
      if (params) {
        params.forEach((p, i) => request.input(`p${i}`, p));
      }

      const result = await request.query(sqlStr);
      const recordset = result.recordset ?? [];

      const fields =
        recordset.columns != null
          ? Object.entries(recordset.columns).map(([name, col]: [string, any]) => ({
              name,
              type: col?.type?.name ?? 'unknown',
            }))
          : recordset.length > 0
            ? Object.keys(recordset[0]).map((name) => ({ name, type: 'unknown' }))
            : [];

      return {
        rows: recordset,
        rowCount: result.rowsAffected?.[0] ?? recordset.length,
        fields,
      };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.pool) throw new Error('Not connected');

    const result = await this.pool.request().query(`
      SELECT SCHEMA_NAME AS name
      FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME NOT IN (
        'sys', 'INFORMATION_SCHEMA', 'guest',
        'db_owner', 'db_securityadmin', 'db_accessadmin',
        'db_backupoperator', 'db_ddladmin',
        'db_datawriter', 'db_datareader',
        'db_denydatawriter', 'db_denydatareader'
      )
      ORDER BY SCHEMA_NAME
    `);

    return result.recordset.map((r) => ({ name: r.name }));
  }

  async getTables(schema?: string): Promise<TableInfo[]> {
    if (!this.pool) throw new Error('Not connected');

    const request = this.pool.request().input('schema', sql.VarChar, schema ?? null);
    const result = await request.query(`
      SELECT
        TABLE_SCHEMA AS [schema],
        TABLE_NAME   AS name,
        CASE TABLE_TYPE WHEN 'VIEW' THEN 'view' ELSE 'table' END AS type
      FROM INFORMATION_SCHEMA.TABLES
      WHERE (@schema IS NULL OR TABLE_SCHEMA = @schema)
        AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    return result.recordset.map((r) => ({
      schema: r.schema,
      name: r.name,
      type: r.type,
    }));
  }

  async getColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    if (!this.pool) throw new Error('Not connected');

    const request = this.pool
      .request()
      .input('table', sql.VarChar, table)
      .input('schema', sql.VarChar, schema ?? null);

    const result = await request.query(`
      SELECT
        c.COLUMN_NAME                                             AS name,
        c.DATA_TYPE                                               AS type,
        c.IS_NULLABLE                                             AS nullable,
        c.COLUMN_DEFAULT                                          AS defaultValue,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END   AS isPrimaryKey
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
          AND tc.TABLE_SCHEMA   = ku.TABLE_SCHEMA
          AND tc.TABLE_NAME     = ku.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND ku.TABLE_NAME      = @table
          AND (@schema IS NULL OR ku.TABLE_SCHEMA = @schema)
      ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_NAME = @table
        AND (@schema IS NULL OR c.TABLE_SCHEMA = @schema)
      ORDER BY c.ORDINAL_POSITION
    `);

    return result.recordset.map((r) => ({
      name: r.name,
      type: r.type,
      nullable: r.nullable === 'YES',
      defaultValue: r.defaultValue ?? null,
      isPrimaryKey: r.isPrimaryKey === 1,
    }));
  }
}
