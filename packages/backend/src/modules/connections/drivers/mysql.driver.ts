import * as mysql from 'mysql2/promise';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

export class MySQLDriver implements DatabaseDriver {
  private pool: mysql.Pool | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    try {
      this.pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        connectionLimit: 5,
        waitForConnections: true,
        queueLimit: 0,
        connectTimeout: 5000,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      });

      // Test the connection
      const connection = await this.pool.getConnection();
      await connection.query('SELECT 1');
      connection.release();
    } catch (error) {
      await this.disconnect();
      throw new Error(`MySQL connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

    try {
      const connection = await this.pool.getConnection();
      await connection.query('SELECT 1');
      connection.release();
      return true;
    } catch (error) {
      return false;
    }
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

    try {
      const [rows, fields] = await this.pool.query(sql);

      // Handle different result types
      if (Array.isArray(rows)) {
        return {
          rows: rows as any[],
          rowCount: rows.length,
          fields: Array.isArray(fields)
            ? fields.map((field) => ({
                name: field.name,
                type: this.mapMySQLType(field.type ?? 0),
              }))
            : [],
        };
      }

      // For INSERT/UPDATE/DELETE
      const resultSet = rows as mysql.ResultSetHeader;
      return {
        rows: [],
        rowCount: resultSet.affectedRows || 0,
        fields: [],
      };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

    const [rows] = await this.pool.query(`
      SELECT SCHEMA_NAME as name
      FROM information_schema.SCHEMATA
      WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY SCHEMA_NAME
    `);

    return rows as SchemaInfo[];
  }

  async getTables(schema?: string): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

    // If no schema provided, use the current database
    const connection = await this.pool.getConnection();
    const [dbResult] = await connection.query('SELECT DATABASE() as db');
    connection.release();

    const currentDb = (dbResult as any)[0].db;
    const targetSchema = schema || currentDb;

    const [rows] = await this.pool.query(
      `
      SELECT
        TABLE_SCHEMA as \`schema\`,
        TABLE_NAME as name,
        TABLE_TYPE as type
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `,
      [targetSchema]
    );

    return (rows as any[]).map((row) => ({
      schema: row.schema,
      name: row.name,
      type: row.type === 'BASE TABLE' ? 'table' : 'view',
    }));
  }

  async getColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

    // If no schema provided, use the current database
    const connection = await this.pool.getConnection();
    const [dbResult] = await connection.query('SELECT DATABASE() as db');
    connection.release();

    const currentDb = (dbResult as any)[0].db;
    const targetSchema = schema || currentDb;

    const [rows] = await this.pool.query(
      `
      SELECT
        COLUMN_NAME as name,
        COLUMN_TYPE as type,
        IS_NULLABLE as nullable,
        COLUMN_DEFAULT as defaultValue,
        COLUMN_KEY as columnKey
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `,
      [targetSchema, table]
    );

    return (rows as any[]).map((row) => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable === 'YES',
      defaultValue: row.defaultValue,
      isPrimaryKey: row.columnKey === 'PRI',
    }));
  }

  private mapMySQLType(typeId: number): string {
    // MySQL type constants
    const typeMap: { [key: number]: string } = {
      0: 'decimal',
      1: 'tinyint',
      2: 'smallint',
      3: 'int',
      4: 'float',
      5: 'double',
      7: 'timestamp',
      8: 'bigint',
      9: 'mediumint',
      10: 'date',
      11: 'time',
      12: 'datetime',
      13: 'year',
      15: 'varchar',
      16: 'bit',
      245: 'json',
      246: 'decimal',
      247: 'enum',
      248: 'set',
      249: 'tinyblob',
      250: 'mediumblob',
      251: 'longblob',
      252: 'blob',
      253: 'varchar',
      254: 'char',
    };

    return typeMap[typeId] || 'unknown';
  }
}
