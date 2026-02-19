import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConnectionsService } from '../../connections/connections.service';

@Injectable()
export class DatabaseImporterService {
  private readonly logger = new Logger(DatabaseImporterService.name);

  constructor(private readonly connectionsService: ConnectionsService) {}

  /**
   * Import data from staging to target database
   */
  async importToDatabase(
    connectionId: string,
    organizationId: string,
    targetTable: string,
    schema: Array<{ name: string; type: string; sample: any }>,
    rows: Record<string, any>[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ rowsSucceeded: number; rowsFailed: number; errors: any[] }> {
    if (rows.length === 0) {
      return { rowsSucceeded: 0, rowsFailed: 0, errors: [] };
    }

    // Get database driver (already connected)
    const driver = await this.connectionsService.getDriver(
      connectionId,
      organizationId
    );

    let rowsSucceeded = 0;
    let rowsFailed = 0;
    const errors: any[] = [];

    try {

      // Check if table exists, create if not
      const tableExists = await this.checkTableExists(
        driver,
        targetTable,
        schema[0]?.name // Sample a column to determine schema
      );

      if (!tableExists) {
        await this.createTable(driver, targetTable, schema);
      }

      // Insert rows in batches
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        try {
          await this.insertBatch(driver, targetTable, batch);
          rowsSucceeded += batch.length;
        } catch (error) {
          // Try inserting rows individually to identify which ones failed
          for (let j = 0; j < batch.length; j++) {
            const row = batch[j];
            const rowNumber = i + j + 1;

            try {
              await this.insertSingleRow(driver, targetTable, row);
              rowsSucceeded++;
            } catch (rowError) {
              rowsFailed++;
              errors.push({
                row: rowNumber,
                column: '*',
                value: row,
                error: rowError.message || String(rowError),
                type: 'CONSTRAINT_VIOLATION',
                severity: 'error',
                suggestion: 'Check data types and constraints for this row',
              });
            }
          }
        }

        // Report progress
        if (onProgress) {
          onProgress(i + batch.length, rows.length);
        }
      }

      this.logger.log(
        `Database import complete: ${rowsSucceeded} succeeded, ${rowsFailed} failed`
      );

      return { rowsSucceeded, rowsFailed, errors };
    } finally {
      await driver.disconnect();
    }
  }

  /**
   * Check if table exists in database
   */
  private async checkTableExists(
    driver: any,
    tableName: string,
    sampleColumn?: string
  ): Promise<boolean> {
    try {
      const result = await driver.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 LIMIT 1`,
        [tableName]
      );
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create table with detected schema
   */
  private async createTable(
    driver: any,
    tableName: string,
    schema: Array<{ name: string; type: string; sample: any }>
  ): Promise<void> {
    const columns = schema
      .map((col) => {
        const sqlType = this.mapTypeToSql(col.type);
        return `"${col.name}" ${sqlType}`;
      })
      .join(', ');

    const createTableSql = `CREATE TABLE "${tableName}" (${columns})`;

    await driver.query(createTableSql);

    this.logger.log(`Created table ${tableName} with ${schema.length} columns`);
  }

  /**
   * Map detected type to SQL type
   */
  private mapTypeToSql(type: string): string {
    const typeMap: Record<string, string> = {
      integer: 'INTEGER',
      numeric: 'NUMERIC',
      boolean: 'BOOLEAN',
      timestamp: 'TIMESTAMP',
      text: 'TEXT',
    };

    return typeMap[type] || 'TEXT';
  }

  /**
   * Insert batch of rows
   */
  private async insertBatch(
    driver: any,
    tableName: string,
    rows: Record<string, any>[]
  ): Promise<void> {
    if (rows.length === 0) return;

    const columns = Object.keys(rows[0]);
    const columnNames = columns.map((col) => `"${col}"`).join(', ');

    // Build VALUES clause with placeholders
    const valuePlaceholders = rows
      .map((_, rowIndex) => {
        const placeholders = columns
          .map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`)
          .join(', ');
        return `(${placeholders})`;
      })
      .join(', ');

    const values: any[] = [];
    rows.forEach((row) => {
      columns.forEach((col) => {
        values.push(row[col]);
      });
    });

    const insertSql = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valuePlaceholders}`;

    await driver.query(insertSql, values);
  }

  /**
   * Insert single row (for error recovery)
   */
  private async insertSingleRow(
    driver: any,
    tableName: string,
    row: Record<string, any>
  ): Promise<void> {
    const columns = Object.keys(row);
    const columnNames = columns.map((col) => `"${col}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map((col) => row[col]);

    const insertSql = `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`;

    await driver.query(insertSql, values);
  }

  /**
   * Validate column mapping
   */
  async validateColumnMapping(
    connectionId: string,
    organizationId: string,
    targetTable: string,
    sourceColumns: string[],
    columnMapping: Record<string, string>
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Get target table schema (driver already connected)
    const driver = await this.connectionsService.getDriver(
      connectionId,
      organizationId
    );

    try {
      const result = await driver.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = $1`,
        [targetTable]
      );

      const targetColumns = new Map(
        result.rows.map((row: any) => [
          row.column_name,
          { type: row.data_type, nullable: row.is_nullable === 'YES' },
        ])
      );

      // Validate each mapped column
      for (const [sourceCol, targetCol] of Object.entries(columnMapping)) {
        if (!sourceColumns.includes(sourceCol)) {
          errors.push(`Source column '${sourceCol}' not found in data`);
        }

        if (!targetColumns.has(targetCol)) {
          errors.push(`Target column '${targetCol}' not found in table`);
        }
      }

      return { valid: errors.length === 0, errors };
    } finally {
      await driver.disconnect();
    }
  }
}
