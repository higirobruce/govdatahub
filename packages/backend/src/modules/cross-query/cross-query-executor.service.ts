import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FdwManagerService } from './fdw-manager.service';
import { QueryBuilderService } from './query-builder.service';
import { QueryDefinitionDto } from './dto/query-definition.dto';
import { CrossQueryResultDto } from './dto/cross-query-result.dto';

@Injectable()
export class CrossQueryExecutorService {
  private readonly logger = new Logger(CrossQueryExecutorService.name);

  constructor(
    private fdwManagerService: FdwManagerService,
    private queryBuilderService: QueryBuilderService,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {}

  /**
   * Execute cross-database query
   */
  async executeCrossQuery(
    queryDefinition: QueryDefinitionDto,
    organizationId: string,
  ): Promise<CrossQueryResultDto> {
    const orgSchema = `fdw_org_${organizationId}`.replace(/-/g, '_');
    let foreignTableMap: Map<string, string> | null = null;

    try {
      const startTime = Date.now();

      // 1. Create foreign tables
      this.logger.log(
        `Creating foreign tables for query with ${queryDefinition.tables.length} tables`,
      );
      foreignTableMap = await this.fdwManagerService.createForeignTablesForQuery(
        queryDefinition,
        organizationId,
      );

      // 2. Generate SQL
      const sql = this.queryBuilderService.generateSqlFromDefinition(
        queryDefinition,
        foreignTableMap,
      );

      // 3. Execute with timeout
      const queryRunner = this.dataSource.createQueryRunner();

      try {
        await queryRunner.connect();

        const timeoutMs = this.configService.get(
          'CROSS_QUERY_TIMEOUT_MS',
          180000,
        ); // 3 minutes default

        const result = await this.executeWithTimeout(
          queryRunner.query(sql),
          timeoutMs,
        );

        const executionTimeMs = Date.now() - startTime;

        // 4. Format result
        const maxRows = this.configService.get('CROSS_QUERY_MAX_ROWS', 50000);
        const rows = result.slice(0, maxRows);

        const fields =
          rows.length > 0
            ? Object.keys(rows[0]).map((key) => ({
                name: key,
                type: this.inferType(rows[0][key]),
              }))
            : [];

        this.logger.log(
          `Cross-query executed successfully in ${executionTimeMs}ms, returned ${rows.length} rows`,
        );

        return {
          rows,
          rowCount: rows.length,
          fields,
          executionTimeMs,
          generatedSql: sql,
        };
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error('Cross-query execution failed', error);

      if (error.message && error.message.includes('timeout')) {
        throw new BadRequestException(
          'Query execution timed out. Please simplify your query or add filters to reduce data volume.',
        );
      }

      throw new BadRequestException(
        `Query execution failed: ${error.message}`,
      );
    } finally {
      // 5. Cleanup: Drop foreign tables
      if (foreignTableMap) {
        this.logger.log('Cleaning up foreign tables');
        await this.fdwManagerService.cleanupForeignTables(
          foreignTableMap,
          orgSchema,
        );
      }
    }
  }

  /**
   * Execute query with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Query timeout exceeded'));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      return result;
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      throw error;
    }
  }

  /**
   * Infer field type from value
   */
  private inferType(value: any): string {
    if (value === null || value === undefined) {
      return 'unknown';
    }

    const type = typeof value;

    switch (type) {
      case 'number':
        return Number.isInteger(value) ? 'integer' : 'numeric';
      case 'boolean':
        return 'boolean';
      case 'string':
        return 'text';
      case 'object':
        if (value instanceof Date) {
          return 'timestamp';
        }
        return 'json';
      default:
        return 'text';
    }
  }
}
