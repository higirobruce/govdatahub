import { Pool, PoolClient, QueryResult as PgQueryResult } from 'pg';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

export class PostgresDriver implements DatabaseDriver {
  private pool: Pool | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    try {
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        max: 5, // Connection pool limit
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
      });

      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch (error) {
      await this.disconnect();
      throw new Error(`PostgreSQL connection failed: ${error.message}`);
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
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
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
      const result: PgQueryResult = await this.pool.query(sql);

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        fields: result.fields.map((field) => ({
          name: field.name,
          type: this.mapPostgresType(field.dataTypeID),
        })),
      };
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

    const result = await this.pool.query(`
      SELECT schema_name as name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);

    return result.rows;
  }

  async getTables(schema: string = 'public'): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

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
      [schema]
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      type: row.type === 'BASE TABLE' ? 'table' : 'view',
    }));
  }

  async getColumns(table: string, schema: string = 'public'): Promise<ColumnInfo[]> {
    if (!this.pool) {
      throw new Error('Not connected');
    }

    const result = await this.pool.query(
      `
      SELECT
        c.column_name as name,
        c.data_type as type,
        c.is_nullable as nullable,
        c.column_default as "defaultValue",
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as "isPrimaryKey"
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
          AND tc.table_schema = ku.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `,
      [schema, table]
    );

    return result.rows.map((row) => ({
      name: row.name,
      type: row.type,
      nullable: row.nullable === 'YES',
      defaultValue: row.defaultValue,
      isPrimaryKey: row.isPrimaryKey,
    }));
  }

  private mapPostgresType(typeId: number): string {
    // Basic type mapping (can be expanded)
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
