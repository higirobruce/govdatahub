import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Not, IsNull } from 'typeorm';
import {
  StagedData,
  Connection,
  Transformation,
  DatasetShare,
  QueryHistory,
  ImportJob,
  ImportJobStatus,
} from '../../database/entities';
import { DatasetCatalogItemDto } from './dto/dataset-catalog-item.dto';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';

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

    return datasets;
  }

  async getStats(organizationId: string): Promise<DashboardStatsDto> {
    // Total datasets
    const [stagedCount, connectionsCount, transformationsCount] = await Promise.all([
      this.stagedDataRepository.count({ where: { organizationId } }),
      this.connectionRepository.count({ where: { organizationId } }),
      this.transformationRepository.count({ where: { organizationId, status: 'active' } }),
    ]);

    const totalDatasets = stagedCount + connectionsCount + transformationsCount;

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
}
