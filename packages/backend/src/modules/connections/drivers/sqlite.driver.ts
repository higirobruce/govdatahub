import Database from 'better-sqlite3';
import {
  DatabaseDriver,
  ConnectionConfig,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryResult,
} from './database-driver.interface';

/**
 * SQLite driver.
 *
 * The `database` field in ConnectionConfig holds the file path (or `:memory:`).
 * Host, port, username, and password are ignored.
 */
export class SQLiteDriver implements DatabaseDriver {
  private db: Database.Database | null = null;

  async connect(config: ConnectionConfig): Promise<void> {
    const filePath = config.database || ':memory:';

    try {
      this.db = new Database(filePath, { timeout: 5000 });
      // Enable WAL mode for better concurrent read performance
      this.db.pragma('journal_mode = WAL');
    } catch (error) {
      throw new Error(`SQLite connection failed: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.db) throw new Error('Not connected');
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.db) throw new Error('Not connected');

    try {
      const stmt = this.db.prepare(sql);
      const upper = sql.trimStart().toUpperCase();
      const isRead =
        upper.startsWith('SELECT') ||
        upper.startsWith('WITH') ||
        upper.startsWith('PRAGMA') ||
        upper.startsWith('EXPLAIN');

      if (isRead) {
        const rows = (params ? stmt.all(...params) : stmt.all()) as any[];
        const fields =
          rows.length > 0
            ? Object.keys(rows[0]).map((name) => ({ name, type: typeof rows[0][name] }))
            : [];
        return { rows, rowCount: rows.length, fields };
      } else {
        const info = params ? stmt.run(...params) : stmt.run();
        return { rows: [], rowCount: info.changes, fields: [] };
      }
    } catch (error) {
      throw new Error(`Query execution failed: ${error.message}`);
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    // SQLite has a single implicit schema; attached databases appear as aliases
    return [{ name: 'main' }];
  }

  async getTables(_schema?: string): Promise<TableInfo[]> {
    if (!this.db) throw new Error('Not connected');

    const rows = this.db
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table', 'view')
           AND name NOT LIKE 'sqlite_%'
         ORDER BY type, name`,
      )
      .all() as { name: string; type: string }[];

    return rows.map((r) => ({ schema: 'main', name: r.name, type: r.type }));
  }

  async getColumns(table: string, _schema?: string): Promise<ColumnInfo[]> {
    if (!this.db) throw new Error('Not connected');

    // PRAGMA table_info does not support parameterized input — safe-escape the identifier
    const escapedTable = table.replace(/"/g, '""');
    const rows = this.db
      .prepare(`PRAGMA table_info("${escapedTable}")`)
      .all() as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];

    return rows.map((r) => ({
      name: r.name,
      type: r.type || 'TEXT',
      nullable: r.notnull === 0,
      defaultValue: r.dflt_value,
      isPrimaryKey: r.pk > 0,
    }));
  }
}
