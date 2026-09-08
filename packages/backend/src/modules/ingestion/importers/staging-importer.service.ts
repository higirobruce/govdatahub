import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StagedData } from '../../../database/entities';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StagingImporterService {
  private readonly logger = new Logger(StagingImporterService.name);
  private static readonly SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

  constructor(
    @InjectRepository(StagedData)
    private readonly stagedDataRepository: Repository<StagedData>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Import data to staging area (metadata DB)
   * Creates actual PostgreSQL tables in staging schema
   * Handles large datasets with chunking (appends to existing table)
   */
  async importToStaging(
    organizationId: string,
    importJobId: string,
    tableName: string,
    schema: Array<{ name: string; type: string; sample: any }>,
    rows: Record<string, any>[]
  ): Promise<void> {
    if (rows.length === 0) return;

    const stagingSchema = `staging_${organizationId.replace(/-/g, '_')}`;
    const sanitizedTableName = this.sanitizeTableName(tableName);
    const shortJobId = importJobId.split('-')[0];
    const fullTableName = `${stagingSchema}.${sanitizedTableName}_${shortJobId}`;

    try {
      // 1. Ensure staging schema exists
      await this.ensureStagingSchema(stagingSchema);

      // 2. Check if table already exists (for chunked imports)
      const tableExists = await this.checkTableExists(fullTableName);

      if (!tableExists) {
        // 3. Create table in staging schema (first chunk)
        await this.createStagingTable(fullTableName, schema);

        // 4. Create metadata record
        const stagedData = this.stagedDataRepository.create({
          id: uuidv4(),
          organizationId,
          importJobId,
          tableName: fullTableName,
          schema,
          data: rows.slice(0, 100), // Store sample data for preview
          rowCount: rows.length,
        });

        await this.stagedDataRepository.save(stagedData);
      } else {
        // Update row count for subsequent chunks
        const existingStagedData = await this.stagedDataRepository.findOne({
          where: { importJobId, organizationId },
        });

        if (existingStagedData) {
          existingStagedData.rowCount += rows.length;
          await this.stagedDataRepository.save(existingStagedData);
        }
      }

      // 5. Insert data into staging table (for all chunks)
      await this.insertDataIntoStagingTable(fullTableName, schema, rows);

      this.logger.log(
        `Imported ${rows.length} rows to staging table ${fullTableName}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to import to staging: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Drops a staging table. The name must be a plain SQL identifier —
   * staging tables are always created as staging_<org>_<name>, so anything
   * else is treated as an injection attempt.
   */
  async dropTable(tableName: string): Promise<void> {
    if (
      !tableName ||
      tableName.length > 128 ||
      !StagingImporterService.SAFE_IDENTIFIER.test(tableName)
    ) {
      throw new BadRequestException(`Invalid staging table name`);
    }
    await this.dataSource.query(`DROP TABLE IF EXISTS "${tableName}"`);
  }

  /**
   * Get staged data by import job ID
   */
  async getStagedDataByJobId(
    importJobId: string,
    organizationId: string
  ): Promise<StagedData[]> {
    return this.stagedDataRepository.find({
      where: { importJobId, organizationId },
    });
  }

  /**
   * Get all staged data for an organization
   */
  async getAllStagedData(
    organizationId: string,
    tableName?: string
  ): Promise<StagedData[]> {
    const where: any = { organizationId };

    if (tableName) {
      where.tableName = tableName;
    }

    return this.stagedDataRepository.find({ where });
  }

  /**
   * Delete staged data by import job ID
   */
  async deleteStagedData(
    importJobId: string,
    organizationId: string
  ): Promise<void> {
    // Get staged data to find table name
    const stagedData = await this.stagedDataRepository.find({
      where: { importJobId, organizationId },
    });

    // Drop staging tables
    for (const staged of stagedData) {
      try {
        await this.dataSource.query(`DROP TABLE IF EXISTS ${staged.tableName}`);
        this.logger.log(`Dropped staging table ${staged.tableName}`);
      } catch (error) {
        this.logger.warn(
          `Failed to drop staging table ${staged.tableName}: ${error.message}`
        );
      }
    }

    // Delete metadata records
    await this.stagedDataRepository.delete({ importJobId, organizationId });
    this.logger.log(`Deleted staged data for job ${importJobId}`);
  }

  /**
   * Get total row count for staged data
   */
  async getTotalRowCount(
    importJobId: string,
    organizationId: string
  ): Promise<number> {
    const stagedData = await this.getStagedDataByJobId(importJobId, organizationId);
    return stagedData.reduce((sum, stage) => sum + stage.rowCount, 0);
  }

  /**
   * Ensure staging schema exists for organization
   */
  private async ensureStagingSchema(schemaName: string): Promise<void> {
    await this.dataSource.query(
      `CREATE SCHEMA IF NOT EXISTS ${this.quoteIdentifier(schemaName)}`
    );
  }

  /**
   * Check if table exists in staging schema
   */
  private async checkTableExists(fullTableName: string): Promise<boolean> {
    const [schemaName, tableName] = fullTableName.split('.');
    const result = await this.dataSource.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = $1
        AND table_name = $2
      )`,
      [schemaName.replace(/"/g, ''), tableName.replace(/"/g, '')]
    );
    return result[0]?.exists || false;
  }

  /**
   * Create table in staging schema
   */
  private async createStagingTable(
    fullTableName: string,
    schema: Array<{ name: string; type: string; sample: any }>
  ): Promise<void> {
    const columns = schema
      .map((col) => {
        const pgType = this.mapTypeToPgType(col.type);
        return `${this.quoteIdentifier(col.name)} ${pgType}`;
      })
      .join(', ');

    const createTableSql = `
      CREATE TABLE IF NOT EXISTS ${fullTableName} (
        _staging_id SERIAL PRIMARY KEY,
        ${columns}
      )
    `;

    await this.dataSource.query(createTableSql);
  }

  /**
   * Insert data into staging table
   */
  private async insertDataIntoStagingTable(
    fullTableName: string,
    schema: Array<{ name: string; type: string; sample: any }>,
    rows: Record<string, any>[]
  ): Promise<void> {
    if (rows.length === 0) return;

    const columnNames = schema.map((col) => this.quoteIdentifier(col.name));
    const placeholders = rows.map((_, rowIdx) => {
      const rowPlaceholders = schema.map(
        (_, colIdx) => `$${rowIdx * schema.length + colIdx + 1}`
      );
      return `(${rowPlaceholders.join(', ')})`;
    });

    const values = rows.flatMap((row) =>
      schema.map((col) => row[col.name] ?? null)
    );

    const insertSql = `
      INSERT INTO ${fullTableName} (${columnNames.join(', ')})
      VALUES ${placeholders.join(', ')}
    `;

    await this.dataSource.query(insertSql, values);
  }

  /**
   * Sanitize table name for PostgreSQL
   */
  private sanitizeTableName(tableName: string): string {
    return tableName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[0-9]/, '_$&')
      .substring(0, 50);
  }

  /**
   * Map detected type to PostgreSQL type
   */
  private mapTypeToPgType(type: string): string {
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
   * Quote PostgreSQL identifier
   */
  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
