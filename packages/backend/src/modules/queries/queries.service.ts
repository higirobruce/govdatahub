import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { QueryHistory, CachedResult } from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { QueryResultDto } from './dto/query-result.dto';
import { ChartDataQueryDto } from './dto/chart-data-query.dto';

@Injectable()
export class QueriesService {
  private readonly queryTimeout: number;
  private readonly maxResultRows: number;

  constructor(
    @InjectRepository(QueryHistory)
    private queryHistoryRepository: Repository<QueryHistory>,
    @InjectRepository(CachedResult)
    private cachedResultRepository: Repository<CachedResult>,
    private connectionsService: ConnectionsService,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {
    this.queryTimeout = this.configService.get<number>('QUERY_TIMEOUT_MS', 30000);
    this.maxResultRows = this.configService.get<number>('MAX_RESULT_ROWS', 10000);
  }

  async executeQuery(executeQueryDto: ExecuteQueryDto, organizationId: string): Promise<QueryResultDto> {
    const queryId = uuidv4();
    const startTime = Date.now();

    try {
      // Get database driver (validates organizationId)
      const driver = await this.connectionsService.getDriver(executeQueryDto.connectionId, organizationId);

      try {
        // Execute query with timeout
        const result = await this.executeWithTimeout(
          driver.query(executeQueryDto.sql),
          this.queryTimeout,
        );

        // Limit result rows
        if (result.rows.length > this.maxResultRows) {
          result.rows = result.rows.slice(0, this.maxResultRows);
        }

        const executionTime = Date.now() - startTime;

        // Log to query history
        await this.logQuery({
          id: queryId,
          connectionId: executeQueryDto.connectionId,
          organizationId,
          sqlQuery: executeQueryDto.sql,
          executionTimeMs: executionTime,
          rowCount: result.rowCount,
          status: 'success',
        });

        // Cache results if requested
        if (executeQueryDto.cacheResults) {
          await this.cacheResults(queryId, organizationId, result);
        }

        return {
          id: queryId,
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields,
          executionTimeMs: executionTime,
          status: 'success',
        };
      } finally {
        await driver.disconnect();
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Log failed query
      await this.logQuery({
        id: queryId,
        connectionId: executeQueryDto.connectionId,
        organizationId,
        sqlQuery: executeQueryDto.sql,
        executionTimeMs: executionTime,
        rowCount: 0,
        status: 'error',
        errorMessage: error.message,
      });

      throw new BadRequestException(`Query execution failed: ${error.message}`);
    }
  }

  async executeChartQuery(dto: ChartDataQueryDto, organizationId: string): Promise<{ rows: any[]; fields: Array<{ name: string; type: string }>; rowCount: number }> {
    const driver = await this.connectionsService.getDriver(dto.connectionId, organizationId);

    try {
      const sql = this.substituteFilters(dto.sql, dto.filters);
      const result = await this.executeWithTimeout(
        driver.query(sql),
        this.queryTimeout,
      );

      if (result.rows.length > this.maxResultRows) {
        result.rows = result.rows.slice(0, this.maxResultRows);
      }

      return {
        rows: result.rows,
        fields: result.fields,
        rowCount: result.rowCount,
      };
    } catch (error) {
      throw new BadRequestException(`Chart query execution failed: ${error.message}`);
    } finally {
      await driver.disconnect();
    }
  }

  async getQueryHistory(organizationId: string, limit: number = 50, offset: number = 0): Promise<QueryHistory[]> {
    return this.queryHistoryRepository.find({
      where: { organizationId },
      order: { executedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getQueryById(id: string, organizationId: string): Promise<QueryHistory> {
    const query = await this.queryHistoryRepository.findOne({
      where: { id, organizationId },
    });

    if (!query) {
      throw new BadRequestException(`Query with ID ${id} not found`);
    }

    return query;
  }

  async getCachedResults(queryId: string, organizationId: string): Promise<any> {
    const cached = await this.cachedResultRepository.findOne({
      where: { queryId, organizationId },
    });

    if (!cached) {
      throw new BadRequestException(`Cached results for query ${queryId} not found`);
    }

    return JSON.parse(cached.results);
  }

  private substituteFilters(sql: string, filters?: Record<string, string>): string {
    if (!filters || Object.keys(filters).length === 0) return sql;
    return Object.entries(filters).reduce((acc, [key, value]) => {
      // Escape single quotes to prevent SQL injection via filter values
      const escaped = String(value).replace(/'/g, "''");
      return acc.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), escaped);
    }, sql);
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout exceeded')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private async logQuery(data: {
    id: string;
    connectionId: string | null;
    organizationId: string;
    sqlQuery: string;
    executionTimeMs: number;
    rowCount: number;
    status: string;
    errorMessage?: string;
  }): Promise<void> {
    const queryHistory = this.queryHistoryRepository.create(data);
    await this.queryHistoryRepository.save(queryHistory);
  }

  private async cacheResults(queryId: string, organizationId: string, result: any): Promise<void> {
    const cachedResult = this.cachedResultRepository.create({
      id: uuidv4(),
      queryId,
      organizationId,
      results: JSON.stringify(result),
    });

    await this.cachedResultRepository.save(cachedResult);
  }

  async executeStagingQuery(sqlQuery: string, organizationId: string): Promise<QueryResultDto> {
    const queryId = uuidv4();
    const startTime = Date.now();
    const stagingSchema = `staging_${organizationId.replace(/-/g, '_')}`;

    try {
      // Validate that query only accesses staging schema
      this.validateStagingQuery(sqlQuery, stagingSchema);

      // Execute query with timeout
      const result = await this.executeWithTimeout(
        this.dataSource.query(sqlQuery),
        this.queryTimeout,
      );

      const executionTime = Date.now() - startTime;

      // Format result
      const rows = Array.isArray(result) ? result : [];
      const rowCount = rows.length;

      // Limit result rows
      const limitedRows = rows.slice(0, this.maxResultRows);

      // Extract field names from first row
      const fields = limitedRows.length > 0
        ? Object.keys(limitedRows[0]).map(name => ({ name, type: 'unknown' }))
        : [];

      // Log to query history (use null as connectionId for staging queries)
      await this.logQuery({
        id: queryId,
        connectionId: null,
        organizationId,
        sqlQuery,
        executionTimeMs: executionTime,
        rowCount,
        status: 'success',
      });

      return {
        id: queryId,
        rows: limitedRows,
        rowCount,
        fields,
        executionTimeMs: executionTime,
        status: 'success',
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Log failed query
      await this.logQuery({
        id: queryId,
        connectionId: null,
        organizationId,
        sqlQuery,
        executionTimeMs: executionTime,
        rowCount: 0,
        status: 'error',
        errorMessage: error.message,
      });

      throw new BadRequestException(`Staging query execution failed: ${error.message}`);
    }
  }

  private validateStagingQuery(sqlQuery: string, stagingSchema: string): void {
    const lowerQuery = sqlQuery.toLowerCase();

    // Block dangerous operations
    const dangerousPatterns = [
      /\bdrop\s+/i,
      /\bdelete\s+/i,
      /\btruncate\s+/i,
      /\bupdate\s+/i,
      /\binsert\s+/i,
      /\balter\s+/i,
      /\bcreate\s+/i,
      /\bgrant\s+/i,
      /\brevoke\s+/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(lowerQuery)) {
        throw new BadRequestException(
          'Only SELECT queries are allowed on staging data'
        );
      }
    }

    // Ensure query references staging schema (basic validation)
    if (!lowerQuery.includes(stagingSchema.toLowerCase())) {
      throw new BadRequestException(
        `Query must reference the staging schema: ${stagingSchema}`
      );
    }
  }
}
