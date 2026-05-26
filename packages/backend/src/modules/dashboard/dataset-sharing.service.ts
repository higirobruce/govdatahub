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
import { ConnectionsService } from '../connections/connections.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';

/**
 * Dataset Sharing Service
 *
 * Manages public sharing of datasets via API keys and share tokens.
 * Supports three dataset types:
 * 1. Staged Data - Imported data from CSV/Excel files
 * 2. Connections - Database connections (requires query execution)
 * 3. Transformations - Transformation pipeline results
 */
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
    private connectionsService: ConnectionsService,
    private encryptionService: EncryptionService,
    private configService: ConfigService,
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

  /**
   * Execute SQL query on a shared dataset via API key
   *
   * Supports querying:
   * - Connection datasets (executes query on remote database)
   * - Staged datasets (executes query on staged data table)
   *
   * @param apiKey - API key for authentication
   * @param sqlQuery - SQL SELECT query to execute
   * @param limit - Maximum rows to return (default: 1000, max: 10000)
   * @param offset - Rows to skip for pagination (default: 0)
   * @returns Query results with metadata
   */
  async executeQueryByApiKey(
    apiKey: string,
    sqlQuery: string,
    limit?: number,
    offset?: number,
  ): Promise<any> {
    // Validate and get share
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

    // Execute query based on dataset type
    return await this.executeQueryOnDataset(share, sqlQuery, limit, offset);
  }

  /**
   * Execute SQL query on a shared dataset via share token
   *
   * Same as executeQueryByApiKey but authenticates via share token.
   *
   * @param shareToken - Share token for authentication
   * @param sqlQuery - SQL SELECT query to execute
   * @param limit - Maximum rows to return
   * @param offset - Rows to skip for pagination
   * @returns Query results
   */
  async executeQueryByShareToken(
    shareToken: string,
    sqlQuery: string,
    limit?: number,
    offset?: number,
  ): Promise<any> {
    // Validate and get share
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

    // Execute query
    return await this.executeQueryOnDataset(share, sqlQuery, limit, offset);
  }

  /**
   * Execute SQL query on a dataset
   *
   * Internal method that handles query execution for different dataset types.
   *
   * @param share - Dataset share record
   * @param sqlQuery - SQL query to execute
   * @param limit - Result limit
   * @param offset - Pagination offset
   * @returns Query results
   */
  private async executeQueryOnDataset(
    share: DatasetShare,
    sqlQuery: string,
    limit?: number,
    offset?: number,
  ): Promise<any> {
    // Validate SQL query (security check)
    this.validateSqlQuery(sqlQuery);

    // Apply limits
    const maxRows = this.configService.get('MAX_RESULT_ROWS', 10000);
    const resultLimit = Math.min(limit || 1000, maxRows);

    switch (share.datasetType) {
      case 'connection':
        return await this.executeConnectionQuery(
          share,
          sqlQuery,
          resultLimit,
          offset,
        );

      case 'staged':
        return await this.executeStagedDataQuery(
          share,
          sqlQuery,
          resultLimit,
          offset,
        );

      case 'transformation':
        throw new BadRequestException(
          'Transformation datasets do not support custom queries. Use GET endpoint to retrieve cached results.',
        );

      default:
        throw new BadRequestException('Invalid dataset type');
    }
  }

  /**
   * Execute query on a shared connection
   *
   * Connects to the remote database and executes the query.
   *
   * @param share - Share record
   * @param sqlQuery - SQL query
   * @param limit - Result limit
   * @param offset - Pagination offset
   * @returns Query results
   */
  private async executeConnectionQuery(
    share: DatasetShare,
    sqlQuery: string,
    limit: number,
    offset?: number,
  ): Promise<any> {
    // Get connection
    const connection = await this.connectionRepository.findOne({
      where: { id: share.datasetId },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    // Get database driver
    const driver = await this.connectionsService.getDriver(
      connection.id,
      share.organizationId,
    );

    try {
      // Add LIMIT and OFFSET to query if not present
      let modifiedQuery = sqlQuery.trim();
      if (!modifiedQuery.toLowerCase().includes('limit')) {
        modifiedQuery += ` LIMIT ${limit}`;
      }
      if (offset && !modifiedQuery.toLowerCase().includes('offset')) {
        modifiedQuery += ` OFFSET ${offset}`;
      }

      // Execute query with timeout
      const startTime = Date.now();
      const queryTimeout = this.configService.get('QUERY_TIMEOUT_MS', 30000);

      const result = await Promise.race([
        driver.query(modifiedQuery),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Query timeout exceeded')),
            queryTimeout,
          ),
        ),
      ]);

      const executionTimeMs = Date.now() - startTime;

      // Format result
      return {
        rows: (result as any).rows || [],
        rowCount: (result as any).rowCount || 0,
        fields:
          (result as any).fields?.map((f: any) => ({
            name: f.name,
            type: f.type || 'unknown',
          })) || [],
        executionTimeMs,
        metadata: {
          connectionName: connection.name,
          connectionType: connection.type,
          datasetName: share.name,
        },
      };
    } finally {
      // Always disconnect
      await driver.disconnect();
    }
  }

  /**
   * Execute query on staged data
   *
   * Queries the staged_data table in the metadata database.
   *
   * @param share - Share record
   * @param sqlQuery - SQL query (will be modified to query staged table)
   * @param limit - Result limit
   * @param offset - Pagination offset
   * @returns Query results
   */
  private async executeStagedDataQuery(
    share: DatasetShare,
    sqlQuery: string,
    limit: number,
    offset?: number,
  ): Promise<any> {
    const staged = await this.stagedDataRepository.findOne({
      where: { id: share.datasetId },
    });

    if (!staged) {
      throw new NotFoundException('Staged data not found');
    }

    // For staged data, we need to query the actual staged table
    // The query should reference the staged table name
    // This is a simplified implementation - in production you'd want to
    // parse and modify the query to target the correct table

    throw new BadRequestException(
      `To query staged data, use: SELECT * FROM ${staged.tableName} in your SQL query`,
    );
  }

  /**
   * Validate SQL query for security
   *
   * Blocks dangerous SQL patterns to prevent data modification or injection.
   *
   * @param sqlQuery - SQL query to validate
   * @throws BadRequestException if query contains dangerous patterns
   */
  private validateSqlQuery(sqlQuery: string): void {
    if (!sqlQuery || typeof sqlQuery !== 'string') {
      throw new BadRequestException('SQL query is required');
    }

    const query = sqlQuery.toLowerCase().trim();

    // Must be a SELECT query
    if (!query.startsWith('select')) {
      throw new BadRequestException('Only SELECT queries are allowed');
    }

    // Block dangerous patterns
    const dangerousPatterns = [
      /;\s*(drop|delete|insert|update|alter|create|truncate|grant|revoke)/i,
      /--/,
      /\/\*/,
      /xp_cmdshell/i,
      /exec\s*\(/i,
      /execute\s*\(/i,
      /script/i,
      /<script/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sqlQuery)) {
        throw new BadRequestException(
          'Query contains dangerous patterns and has been blocked',
        );
      }
    }

    // Additional validation - no semicolons except at the end
    const semicolonCount = (sqlQuery.match(/;/g) || []).length;
    if (semicolonCount > 1 || (semicolonCount === 1 && !sqlQuery.trim().endsWith(';'))) {
      throw new BadRequestException('Multiple statements are not allowed');
    }
  }
}
