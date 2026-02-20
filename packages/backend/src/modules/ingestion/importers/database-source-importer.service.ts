import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConnectionsService } from '../../connections/connections.service';
import { StagingImporterService } from './staging-importer.service';

export interface DatabaseImportConfig {
  schema: string;
  table: string;
  columns?: string[]; // Optional: specific columns to import
  whereClause?: string; // Optional: filter rows
  rowLimit?: number; // Optional: limit number of rows
  targetTable?: string; // Optional: custom staging table name
}

@Injectable()
export class DatabaseSourceImporterService {
  private readonly logger = new Logger(DatabaseSourceImporterService.name);

  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly stagingImporter: StagingImporterService
  ) {}

  /**
   * Import data from database connection to staging
   */
  async importFromDatabase(
    connectionId: string,
    organizationId: string,
    config: DatabaseImportConfig,
    importJobId: string
  ): Promise<{ rowCount: number }> {
    this.logger.log(
      `Importing from database connection ${connectionId}: ${config.schema}.${config.table}`
    );

    // Get database driver
    const driver = await this.connectionsService.getDriver(connectionId, organizationId);

    try {
      // Build SQL query
      const sql = this.buildQuery(config);

      this.logger.log(`Executing query: ${sql}`);

      // Execute query
      const result = await driver.query(sql);

      if (!result.rows || result.rows.length === 0) {
        this.logger.warn('Query returned no rows');
        return { rowCount: 0 };
      }

      // Extract schema from results
      const schema = this.extractSchemaFromRows(result.rows);

      // Determine target table name
      const targetTableName =
        config.targetTable || `${config.schema}_${config.table}`;

      // Import to staging using existing StagingImporter
      await this.stagingImporter.importToStaging(
        organizationId,
        importJobId,
        targetTableName,
        schema,
        result.rows
      );

      this.logger.log(
        `Successfully imported ${result.rows.length} rows from ${config.schema}.${config.table}`
      );

      return { rowCount: result.rows.length };
    } catch (error) {
      this.logger.error(`Database import failed: ${error.message}`, error.stack);
      throw new BadRequestException(
        `Failed to import from database: ${error.message}`
      );
    } finally {
      // Always disconnect
      await driver.disconnect();
    }
  }

  /**
   * Build SQL query from configuration
   */
  private buildQuery(config: DatabaseImportConfig): string {
    // Column selection
    const columns =
      config.columns && config.columns.length > 0
        ? config.columns.map((col) => this.quoteIdentifier(col)).join(', ')
        : '*';

    // Base query
    let sql = `SELECT ${columns} FROM ${this.quoteIdentifier(config.schema)}.${this.quoteIdentifier(config.table)}`;

    // WHERE clause
    if (config.whereClause && config.whereClause.trim()) {
      // Basic sanitization - reject dangerous patterns
      this.validateWhereClause(config.whereClause);
      sql += ` WHERE ${config.whereClause}`;
    }

    // LIMIT clause
    if (config.rowLimit && config.rowLimit > 0) {
      sql += ` LIMIT ${config.rowLimit}`;
    }

    return sql;
  }

  /**
   * Validate WHERE clause to prevent SQL injection
   */
  private validateWhereClause(whereClause: string): void {
    const dangerous = [
      /;\s*DROP/i,
      /;\s*DELETE/i,
      /;\s*UPDATE/i,
      /;\s*INSERT/i,
      /;\s*CREATE/i,
      /;\s*ALTER/i,
      /--/,
      /\/\*/,
      /xp_/i,
    ];

    for (const pattern of dangerous) {
      if (pattern.test(whereClause)) {
        throw new BadRequestException(
          `Invalid WHERE clause: potentially dangerous pattern detected`
        );
      }
    }
  }

  /**
   * Quote identifier for SQL (basic implementation)
   */
  private quoteIdentifier(identifier: string): string {
    // Remove any existing quotes and escape internal quotes
    const cleaned = identifier.replace(/"/g, '""');
    return `"${cleaned}"`;
  }

  /**
   * Extract schema from result rows
   */
  private extractSchemaFromRows(
    rows: any[]
  ): Array<{ name: string; type: string; sample: any }> {
    if (rows.length === 0) {
      return [];
    }

    const firstRow = rows[0];
    const schema: Array<{ name: string; type: string; sample: any }> = [];

    for (const [columnName, value] of Object.entries(firstRow)) {
      const type = this.inferType(value);
      schema.push({
        name: columnName,
        type,
        sample: value,
      });
    }

    return schema;
  }

  /**
   * Infer PostgreSQL type from JavaScript value
   */
  private inferType(value: any): string {
    if (value === null || value === undefined) {
      return 'text';
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'numeric';
    }

    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (value instanceof Date) {
      return 'timestamp';
    }

    if (typeof value === 'string') {
      // Try to detect date strings
      if (!isNaN(Date.parse(value))) {
        const parsed = new Date(value);
        // Check if it's a valid date (not just a number)
        if (parsed.getFullYear() > 1900) {
          return 'timestamp';
        }
      }
    }

    return 'text';
  }

  /**
   * Get available columns for a table (for UI preview)
   */
  async getTableColumns(
    connectionId: string,
    organizationId: string,
    schema: string,
    table: string
  ): Promise<Array<{ name: string; type: string }>> {
    const driver = await this.connectionsService.getDriver(
      connectionId,
      organizationId
    );

    try {
      // Query for column information
      const sql = `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = ${this.quoteLiteral(schema)}
          AND table_name = ${this.quoteLiteral(table)}
        ORDER BY ordinal_position
      `;

      const result = await driver.query(sql);

      return result.rows.map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
      }));
    } catch (error) {
      this.logger.error(`Failed to get table columns: ${error.message}`);
      throw new BadRequestException(
        `Failed to get table columns: ${error.message}`
      );
    } finally {
      await driver.disconnect();
    }
  }

  /**
   * Quote literal value for SQL
   */
  private quoteLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
