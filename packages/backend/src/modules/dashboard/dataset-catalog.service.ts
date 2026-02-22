import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Not, IsNull, LessThan } from 'typeorm';
import {
  StagedData,
  Connection,
  Transformation,
  DatasetShare,
  QueryHistory,
  ImportJob,
  ImportJobStatus,
  TransformationRun,
  SavedCrossQuery,
} from '../../database/entities';
import { DatasetCatalogItemDto } from './dto/dataset-catalog-item.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { QueryPerformanceStatsDto, SlowQueryDto } from './dto/query-performance-stats.dto';
import { SharedDatasetStatsDto, MostAccessedDatasetDto } from './dto/shared-dataset-stats.dto';
import { DataFreshnessStatsDto, StaleDatasetDto, FailedTransformationDto } from './dto/data-freshness-stats.dto';
import { ConnectionHealthStatsDto, ConnectionStatusDto } from './dto/connection-health-stats.dto';
import { ConnectionsService } from '../connections/connections.service';

@Injectable()
export class DatasetCatalogService {
  constructor(
    @InjectRepository(StagedData)
    private stagedDataRepository: Repository<StagedData>,
    @InjectRepository(Connection)
    private connectionRepository: Repository<Connection>,
    @InjectRepository(Transformation)
    private transformationRepository: Repository<Transformation>,
    @InjectRepository(DatasetShare)
    private datasetShareRepository: Repository<DatasetShare>,
    @InjectRepository(QueryHistory)
    private queryHistoryRepository: Repository<QueryHistory>,
    @InjectRepository(ImportJob)
    private importJobRepository: Repository<ImportJob>,
    @InjectRepository(TransformationRun)
    private transformationRunRepository: Repository<TransformationRun>,
    @InjectRepository(SavedCrossQuery)
    private savedCrossQueryRepository: Repository<SavedCrossQuery>,
    private connectionsService: ConnectionsService,
  ) {}

  async getCatalog(organizationId: string): Promise<DatasetCatalogItemDto[]> {
    const datasets: DatasetCatalogItemDto[] = [];

    // Get all shares for this organization to check which datasets are shared
    const shares = await this.datasetShareRepository.find({
      where: { organizationId, active: true },
    });

    const sharesMap = new Map(
      shares.map((s) => [`${s.datasetType}:${s.datasetId}`, s]),
    );

    // 1. Get staged data
    const stagedData = await this.stagedDataRepository.find({
      where: { organizationId },
      relations: ['importJob'],
    });

    for (const staged of stagedData) {
      const shareKey = `staged:${staged.id}`;
      const share = sharesMap.get(shareKey);

      datasets.push({
        id: staged.id,
        name: staged.tableName,
        description: `Staged data from import`,
        type: 'staged',
        tableName: staged.tableName,
        rowCount: staged.rowCount || 0,
        lastUpdated: staged.createdAt.toISOString(),
        source: 'Data Import',
        isShared: !!share,
        accessLevel: share?.accessLevel || 'private',
        shareId: share?.id,
      });
    }

    // 2. Get connections (as potential data sources)
    const connections = await this.connectionRepository.find({
      where: { organizationId },
    });

    for (const conn of connections) {
      const shareKey = `connection:${conn.id}`;
      const share = sharesMap.get(shareKey);

      datasets.push({
        id: conn.id,
        name: conn.name,
        description: `${conn.type} connection`,
        type: 'connection',
        tableName: '-', // Connections have multiple tables
        rowCount: 0,
        lastUpdated: conn.createdAt.toISOString(),
        source: `${conn.type} Database`,
        isShared: !!share,
        accessLevel: share?.accessLevel || 'private',
        shareId: share?.id,
      });
    }

    // 3. Get transformation outputs
    const transformations = await this.transformationRepository.find({
      where: { organizationId, status: 'active' },
    });

    for (const transformation of transformations) {
      const shareKey = `transformation:${transformation.id}`;
      const share = sharesMap.get(shareKey);

      datasets.push({
        id: transformation.id,
        name: transformation.name,
        description: transformation.description,
        type: 'transformation',
        tableName: transformation.name.toLowerCase().replace(/\s+/g, '_'),
        rowCount: 0, // Would need to query cached results for accurate count
        lastUpdated: transformation.lastRunAt?.toISOString() || transformation.createdAt.toISOString(),
        source: 'Transformation Pipeline',
        isShared: !!share,
        accessLevel: share?.accessLevel || 'private',
        shareId: share?.id,
      });
    }

    // 4. Get saved cross-queries
    const crossQueries = await this.savedCrossQueryRepository.find({
      where: { organizationId },
    });

    for (const crossQuery of crossQueries) {
      const shareKey = `cross-query:${crossQuery.id}`;
      const share = sharesMap.get(shareKey);

      datasets.push({
        id: crossQuery.id,
        name: crossQuery.name,
        description: crossQuery.description || 'Cross-database query',
        type: 'cross-query',
        tableName: '-', // Cross-queries span multiple tables
        rowCount: 0, // Would need to execute query to get accurate count
        lastUpdated: crossQuery.updatedAt?.toISOString() || crossQuery.createdAt.toISOString(),
        source: 'Cross-Database Query',
        isShared: !!share,
        accessLevel: share?.accessLevel || 'private',
        shareId: share?.id,
      });
    }

    return datasets;
  }

  async getStats(organizationId: string): Promise<DashboardStatsDto> {
    // Total datasets
    const [stagedCount, connectionsCount, transformationsCount, crossQueriesCount] = await Promise.all([
      this.stagedDataRepository.count({ where: { organizationId } }),
      this.connectionRepository.count({ where: { organizationId } }),
      this.transformationRepository.count({ where: { organizationId, status: 'active' } }),
      this.savedCrossQueryRepository.count({ where: { organizationId } }),
    ]);

    const totalDatasets = stagedCount + connectionsCount + transformationsCount + crossQueriesCount;

    // Active connections
    const activeConnections = connectionsCount;

    // Queries today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const queriesToday = await this.queryHistoryRepository.count({
      where: {
        organizationId,
        executedAt: MoreThan(today),
      },
    });

    // Active API endpoints (shared datasets with API access)
    const activeApiEndpoints = await this.datasetShareRepository.count({
      where: {
        organizationId,
        active: true,
        apiKey: Not(IsNull()), // Has API key means it's accessible via API
      },
    });

    // Failed jobs
    const failedJobs = await this.importJobRepository.count({
      where: {
        organizationId,
        status: ImportJobStatus.FAILED,
      },
    });

    return {
      totalDatasets,
      activeConnections,
      queriesToday,
      activeApiEndpoints,
      failedJobs,
      totalTransformations: transformationsCount,
    };
  }

  /**
   * Get query performance analytics
   * Includes avg execution time, failure rates, slowest queries, and trends
   */
  async getQueryPerformanceStats(organizationId: string, days: number = 7): Promise<QueryPerformanceStatsDto> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all queries in the time period
    const queries = await this.queryHistoryRepository.find({
      where: {
        organizationId,
        executedAt: MoreThan(since),
      },
      order: { executedAt: 'DESC' },
    });

    const totalQueries = queries.length;
    const failedQueries = queries.filter(q => q.status === 'error').length;
    const timeoutQueries = queries.filter(q => q.errorMessage?.includes('timeout')).length;

    // Calculate average execution time (only successful queries)
    const successfulQueries = queries.filter(q => q.status === 'success' && q.executionTimeMs);
    const avgExecutionTimeMs = successfulQueries.length > 0
      ? Math.round(successfulQueries.reduce((sum, q) => sum + (q.executionTimeMs || 0), 0) / successfulQueries.length)
      : 0;

    const failureRate = totalQueries > 0 ? (failedQueries / totalQueries) * 100 : 0;

    // Get top 10 slowest queries
    const slowestQueries: SlowQueryDto[] = successfulQueries
      .sort((a, b) => (b.executionTimeMs || 0) - (a.executionTimeMs || 0))
      .slice(0, 10)
      .map(q => ({
        id: q.id,
        sqlQuery: q.sqlQuery.length > 100 ? q.sqlQuery.substring(0, 100) + '...' : q.sqlQuery,
        executionTimeMs: q.executionTimeMs || 0,
        status: q.status,
        executedAt: q.executedAt.toISOString(),
        connectionName: undefined, // TODO: Join with connection if needed
      }));

    // Queries by day
    const queriesByDay: Record<string, number> = {};
    queries.forEach(q => {
      const date = q.executedAt.toISOString().split('T')[0];
      queriesByDay[date] = (queriesByDay[date] || 0) + 1;
    });

    return {
      avgExecutionTimeMs,
      totalQueries,
      failedQueries,
      failureRate: Math.round(failureRate * 10) / 10,
      timeoutQueries,
      slowestQueries,
      queriesByDay,
    };
  }

  /**
   * Get shared dataset analytics
   * Includes access stats, most accessed datasets, API usage trends
   */
  async getSharedDatasetStats(organizationId: string, days: number = 7): Promise<SharedDatasetStatsDto> {
    const shares = await this.datasetShareRepository.find({
      where: { organizationId, active: true },
      order: { accessCount: 'DESC' },
    });

    const totalSharedDatasets = shares.length;
    const publicShares = shares.filter(s => s.accessLevel === 'public').length;
    const organizationShares = shares.filter(s => s.accessLevel === 'organization').length;
    const privateShares = shares.filter(s => s.accessLevel === 'private').length;

    const totalApiCalls = shares.reduce((sum, s) => sum + s.accessCount, 0);

    // API calls today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sharesToday = shares.filter(s => s.lastAccessedAt && s.lastAccessedAt >= today);
    const apiCallsToday = sharesToday.reduce((sum, s) => sum + s.accessCount, 0);

    // Most accessed datasets (top 10)
    const mostAccessedDatasets: MostAccessedDatasetDto[] = shares
      .filter(s => s.accessCount > 0)
      .slice(0, 10)
      .map(s => ({
        id: s.id,
        name: s.name,
        datasetType: s.datasetType,
        accessCount: s.accessCount,
        lastAccessedAt: s.lastAccessedAt?.toISOString() || '',
        apiKey: s.apiKey ? `${s.apiKey.substring(0, 12)}...` : '', // Truncate for security
      }));

    // API calls by day (estimate based on lastAccessedAt)
    // Note: This is a simplified version. For accurate tracking, you'd need a separate access_logs table
    const apiCallsByDay: Record<string, number> = {};
    shares.forEach(s => {
      if (s.lastAccessedAt) {
        const date = s.lastAccessedAt.toISOString().split('T')[0];
        apiCallsByDay[date] = (apiCallsByDay[date] || 0) + 1;
      }
    });

    return {
      totalSharedDatasets,
      publicShares,
      organizationShares,
      privateShares,
      totalApiCalls,
      apiCallsToday,
      mostAccessedDatasets,
      apiCallsByDay,
    };
  }

  /**
   * Get data freshness and quality stats
   * Includes stale datasets, failed transformations, success rates
   */
  async getDataFreshnessStats(organizationId: string): Promise<DataFreshnessStatsDto> {
    const staleThresholdDays = 30;
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleThresholdDays);

    // Find stale shared datasets (not accessed in 30+ days)
    const staleShares = await this.datasetShareRepository.find({
      where: [
        { organizationId, lastAccessedAt: LessThan(staleDate) },
        { organizationId, lastAccessedAt: IsNull() },
      ],
    });

    const staleDatasetsList: StaleDatasetDto[] = staleShares.slice(0, 10).map(s => {
      const daysSince = s.lastAccessedAt
        ? Math.floor((Date.now() - s.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        id: s.id,
        name: s.name,
        type: s.datasetType,
        daysSinceLastAccess: daysSince,
        lastAccessedAt: s.lastAccessedAt?.toISOString() || 'Never',
      };
    });

    // Get transformation health stats
    const transformations = await this.transformationRepository.find({
      where: { organizationId, status: 'active' },
    });

    const totalTransformations = transformations.length;

    // Get recent transformation runs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRuns = await this.transformationRunRepository.find({
      where: {
        startedAt: MoreThan(thirtyDaysAgo),
      },
      order: { startedAt: 'DESC' },
    });

    // Count transformations with recent failures
    const failedTransformationsMap = new Map<string, { count: number; lastError: string; lastRun: Date }>();

    recentRuns.forEach(run => {
      if (run.status === 'failed' || run.status === 'timeout') {
        const existing = failedTransformationsMap.get(run.transformationId);
        if (!existing || run.startedAt > existing.lastRun) {
          failedTransformationsMap.set(run.transformationId, {
            count: (existing?.count || 0) + 1,
            lastError: run.errorMessage || 'Unknown error',
            lastRun: run.startedAt,
          });
        }
      }
    });

    // Get transformation details for failed ones
    const failedTransformationsList: FailedTransformationDto[] = [];
    for (const [transformationId, failureInfo] of failedTransformationsMap.entries()) {
      const transformation = transformations.find(t => t.id === transformationId);
      if (transformation) {
        failedTransformationsList.push({
          id: transformation.id,
          name: transformation.name,
          lastRunAt: transformation.lastRunAt?.toISOString() || '',
          errorMessage: failureInfo.lastError,
          consecutiveFailures: failureInfo.count,
        });
      }
    }

    // Calculate success rate
    const successfulRuns = recentRuns.filter(r => r.status === 'success').length;
    const transformationSuccessRate = recentRuns.length > 0
      ? (successfulRuns / recentRuns.length) * 100
      : 100;

    return {
      staleDatasets: staleShares.length,
      failedTransformations: failedTransformationsMap.size,
      totalTransformations,
      transformationSuccessRate: Math.round(transformationSuccessRate * 10) / 10,
      staleDatasetsList,
      failedTransformationsList: failedTransformationsList.slice(0, 10),
    };
  }

  /**
   * Get connection health status
   * Includes online/offline status, query counts, error tracking
   */
  async getConnectionHealthStats(organizationId: string): Promise<ConnectionHealthStatsDto> {
    const connections = await this.connectionRepository.find({
      where: { organizationId },
    });

    const totalConnections = connections.length;
    let onlineConnections = 0;
    let offlineConnections = 0;
    let errorConnections = 0;
    let idleConnections = 0;

    const connectionsByType: Record<string, number> = {};

    // Get query counts for each connection (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const connectionStatuses: ConnectionStatusDto[] = [];

    for (const conn of connections) {
      // Count queries for this connection
      const queryCount = await this.queryHistoryRepository.count({
        where: {
          connectionId: conn.id,
          executedAt: MoreThan(thirtyDaysAgo),
        },
      });

      // Count recent errors
      const recentErrors = await this.queryHistoryRepository.count({
        where: {
          connectionId: conn.id,
          status: 'error',
          executedAt: MoreThan(thirtyDaysAgo),
        },
      });

      // Get last query time
      const lastQuery = await this.queryHistoryRepository.findOne({
        where: { connectionId: conn.id },
        order: { executedAt: 'DESC' },
      });

      // Determine status
      let status: 'online' | 'offline' | 'error' | 'untested' = 'untested';

      if (queryCount === 0) {
        status = 'untested';
        idleConnections++;
      } else if (recentErrors > 5) {
        status = 'error';
        errorConnections++;
      } else if (lastQuery && lastQuery.status === 'success') {
        status = 'online';
        onlineConnections++;
      } else {
        status = 'offline';
        offlineConnections++;
      }

      connectionStatuses.push({
        id: conn.id,
        name: conn.name,
        type: conn.type,
        status,
        queryCount,
        lastUsedAt: lastQuery?.executedAt?.toISOString() || '',
        recentErrors,
      });

      // Track by type
      connectionsByType[conn.type] = (connectionsByType[conn.type] || 0) + 1;
    }

    return {
      totalConnections,
      onlineConnections,
      offlineConnections,
      errorConnections,
      idleConnections,
      connections: connectionStatuses,
      connectionsByType,
    };
  }
}
