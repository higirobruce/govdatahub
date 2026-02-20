import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  DatasetShare,
  StagedData,
  Connection,
  Transformation,
  CachedResult,
} from '../../database/entities';
import { CreateShareDto } from './dto/create-share.dto';

@Injectable()
export class DatasetSharingService {
  constructor(
    @InjectRepository(DatasetShare)
    private datasetShareRepository: Repository<DatasetShare>,
    @InjectRepository(StagedData)
    private stagedDataRepository: Repository<StagedData>,
    @InjectRepository(Connection)
    private connectionRepository: Repository<Connection>,
    @InjectRepository(Transformation)
    private transformationRepository: Repository<Transformation>,
    @InjectRepository(CachedResult)
    private cachedResultRepository: Repository<CachedResult>,
  ) {}

  private generateApiKey(): string {
    // Generate a secure API key
    return `gd_${randomBytes(32).toString('hex')}`;
  }

  private generateShareToken(): string {
    // Generate a secure share token
    return randomBytes(24).toString('hex');
  }

  async createShare(
    dto: CreateShareDto,
    organizationId: string,
    userId: string,
  ): Promise<DatasetShare> {
    // Verify dataset exists
    await this.verifyDatasetExists(dto.datasetType, dto.datasetId, organizationId);

    // Check if already shared
    const existing = await this.datasetShareRepository.findOne({
      where: {
        datasetType: dto.datasetType,
        datasetId: dto.datasetId,
        organizationId,
        active: true,
      },
    });

    if (existing) {
      throw new BadRequestException('Dataset is already shared');
    }

    // Get dataset metadata
    const metadata = await this.getDatasetMetadata(dto.datasetType, dto.datasetId, organizationId);

    // Create share
    const share = new DatasetShare();
    share.id = uuidv4();
    share.name = dto.name;
    share.description = dto.description;
    share.datasetType = dto.datasetType;
    share.datasetId = dto.datasetId;
    share.tableName = dto.tableName || metadata.tableName;
    share.organizationId = organizationId;
    share.createdBy = userId;
    share.accessLevel = dto.accessLevel;
    share.apiKey = dto.generateApiKey ? this.generateApiKey() : undefined;
    share.shareToken = dto.generateShareToken ? this.generateShareToken() : undefined;
    share.active = true;
    share.rowCount = metadata.rowCount;
    share.schema = metadata.schema;

    return await this.datasetShareRepository.save(share);
  }

  async getShares(organizationId: string): Promise<DatasetShare[]> {
    return await this.datasetShareRepository.find({
      where: { organizationId, active: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getShare(shareId: string, organizationId: string): Promise<DatasetShare> {
    const share = await this.datasetShareRepository.findOne({
      where: { id: shareId, organizationId },
    });

    if (!share) {
      throw new NotFoundException('Share not found');
    }

    return share;
  }

  async regenerateApiKey(shareId: string, organizationId: string): Promise<DatasetShare> {
    const share = await this.getShare(shareId, organizationId);
    share.apiKey = this.generateApiKey();
    return await this.datasetShareRepository.save(share);
  }

  async regenerateShareToken(shareId: string, organizationId: string): Promise<DatasetShare> {
    const share = await this.getShare(shareId, organizationId);
    share.shareToken = this.generateShareToken();
    return await this.datasetShareRepository.save(share);
  }

  async deleteShare(shareId: string, organizationId: string): Promise<void> {
    const share = await this.getShare(shareId, organizationId);
    share.active = false;
    await this.datasetShareRepository.save(share);
  }

  async getDataByApiKey(apiKey: string): Promise<any> {
    const share = await this.datasetShareRepository.findOne({
      where: { apiKey, active: true },
    });

    if (!share) {
      throw new NotFoundException('Invalid API key');
    }

    // Update access stats
    share.accessCount += 1;
    share.lastAccessedAt = new Date();
    await this.datasetShareRepository.save(share);

    // Fetch and return data
    return await this.fetchDatasetData(share);
  }

  async getDataByShareToken(shareToken: string): Promise<any> {
    const share = await this.datasetShareRepository.findOne({
      where: { shareToken, active: true },
    });

    if (!share) {
      throw new NotFoundException('Invalid share token');
    }

    // Update access stats
    share.accessCount += 1;
    share.lastAccessedAt = new Date();
    await this.datasetShareRepository.save(share);

    // Fetch and return data
    return await this.fetchDatasetData(share);
  }

  private async verifyDatasetExists(
    type: string,
    id: string,
    organizationId: string,
  ): Promise<void> {
    let exists = false;

    switch (type) {
      case 'staged':
        exists = !!(await this.stagedDataRepository.findOne({
          where: { id, organizationId },
        }));
        break;
      case 'connection':
        exists = !!(await this.connectionRepository.findOne({
          where: { id, organizationId },
        }));
        break;
      case 'transformation':
        exists = !!(await this.transformationRepository.findOne({
          where: { id, organizationId },
        }));
        break;
    }

    if (!exists) {
      throw new NotFoundException(`Dataset not found: ${type}/${id}`);
    }
  }

  private async getDatasetMetadata(
    type: string,
    id: string,
    organizationId: string,
  ): Promise<{ tableName: string; rowCount: number; schema: string }> {
    switch (type) {
      case 'staged': {
        const staged = await this.stagedDataRepository.findOne({
          where: { id, organizationId },
        });
        if (!staged) {
          throw new NotFoundException('Staged data not found');
        }
        return {
          tableName: staged.tableName,
          rowCount: staged.rowCount || 0,
          schema: JSON.stringify(staged.schema || {}),
        };
      }
      case 'connection': {
        const conn = await this.connectionRepository.findOne({
          where: { id, organizationId },
        });
        if (!conn) {
          throw new NotFoundException('Connection not found');
        }
        return {
          tableName: conn.name,
          rowCount: 0,
          schema: '{}',
        };
      }
      case 'transformation': {
        const transformation = await this.transformationRepository.findOne({
          where: { id, organizationId },
        });
        if (!transformation) {
          throw new NotFoundException('Transformation not found');
        }
        return {
          tableName: transformation.name,
          rowCount: 0,
          schema: '{}',
        };
      }
      default:
        throw new BadRequestException('Invalid dataset type');
    }
  }

  private async fetchDatasetData(share: DatasetShare): Promise<any> {
    switch (share.datasetType) {
      case 'staged':
        return await this.fetchStagedData(share);
      case 'connection':
        return await this.fetchConnectionData(share);
      case 'transformation':
        return await this.fetchTransformationData(share);
      default:
        throw new BadRequestException('Invalid dataset type');
    }
  }

  private async fetchStagedData(share: DatasetShare): Promise<any> {
    // Query the staged_data table
    const staged = await this.stagedDataRepository.findOne({
      where: { id: share.datasetId },
    });

    if (!staged) {
      throw new NotFoundException('Staged data not found');
    }

    // Return metadata and data location
    return {
      metadata: {
        name: share.name,
        description: share.description,
        tableName: staged.tableName,
        rowCount: staged.rowCount,
        schema: staged.schema,
      },
      data: {
        type: 'staged',
        tableName: staged.tableName,
        // In a real implementation, you'd query the actual data here
        message: 'Use the query API to fetch data from this table',
      },
    };
  }

  private async fetchConnectionData(share: DatasetShare): Promise<any> {
    const connection = await this.connectionRepository.findOne({
      where: { id: share.datasetId },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    return {
      metadata: {
        name: share.name,
        description: share.description,
        connectionName: connection.name,
        connectionType: connection.type,
      },
      data: {
        type: 'connection',
        message: 'Use the query API to fetch data from this connection',
      },
    };
  }

  private async fetchTransformationData(share: DatasetShare): Promise<any> {
    const transformation = await this.transformationRepository.findOne({
      where: { id: share.datasetId },
    });

    if (!transformation) {
      throw new NotFoundException('Transformation not found');
    }

    // Try to get latest cached results
    const latestRun = await this.cachedResultRepository.findOne({
      where: { organizationId: share.organizationId },
      order: { cachedAt: 'DESC' },
    });

    return {
      metadata: {
        name: share.name,
        description: share.description,
        transformationName: transformation.name,
        lastRun: transformation.lastRunAt,
      },
      data: latestRun ? JSON.parse(latestRun.results) : null,
    };
  }
}
