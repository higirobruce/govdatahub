import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Connection } from '../../database/entities';
import { EncryptionService } from '../encryption/encryption.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { ConnectionConfig, DatabaseDriver } from './drivers/database-driver.interface';
import { PostgresDriver } from './drivers/postgres.driver';
import { MySQLDriver } from './drivers/mysql.driver';
import { RedshiftDriver } from './drivers/redshift.driver';
import { SnowflakeDriver } from './drivers/snowflake.driver';
import { BigQueryDriver } from './drivers/bigquery.driver';

@Injectable()
export class ConnectionsService {
  constructor(
    @InjectRepository(Connection)
    private connectionsRepository: Repository<Connection>,
    private encryptionService: EncryptionService,
  ) {}

  async create(createConnectionDto: CreateConnectionDto, organizationId: string): Promise<ConnectionResponseDto> {
    // Test connection before saving
    await this.testConnectionConfig(createConnectionDto);

    const config = this.buildConfig(createConnectionDto);

    // Encrypt the config
    const encryptedConfig = this.encryptionService.encryptObject(config);

    // Save to database
    const connection = this.connectionsRepository.create({
      id: uuidv4(),
      name: createConnectionDto.name,
      type: createConnectionDto.type,
      config: encryptedConfig,
      organizationId,
    });

    const saved = await this.connectionsRepository.save(connection);

    return this.toResponseDto(saved, config);
  }

  async findAll(organizationId: string): Promise<ConnectionResponseDto[]> {
    const connections = await this.connectionsRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });

    return connections.map((conn) => {
      const config = this.encryptionService.decryptObject<ConnectionConfig>(conn.config);
      return this.toResponseDto(conn, config);
    });
  }

  async findOne(id: string, organizationId: string): Promise<ConnectionResponseDto> {
    const connection = await this.connectionsRepository.findOne({
      where: { id, organizationId },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    const config = this.encryptionService.decryptObject<ConnectionConfig>(connection.config);
    return this.toResponseDto(connection, config);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.connectionsRepository.delete({ id, organizationId });

    if (result.affected === 0) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }
  }

  async testConnection(id: string, organizationId: string): Promise<{ success: boolean; message: string; error?: string }> {
    const connection = await this.connectionsRepository.findOne({
      where: { id, organizationId },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    const config = this.encryptionService.decryptObject<ConnectionConfig>(connection.config);

    try {
      const driver = this.createDriver(connection.type);
      await driver.connect(config);
      const isAlive = await driver.testConnection();
      await driver.disconnect();

      if (isAlive) {
        return {
          success: true,
          message: 'Connection successful',
        };
      } else {
        return {
          success: false,
          message: 'Connection test failed',
          error: 'Unable to connect to database',
        };
      }
    } catch (error) {
      return {
        success: false,
        message: 'Connection test failed',
        error: error.message,
      };
    }
  }

  async getDriver(id: string, organizationId: string): Promise<DatabaseDriver> {
    const connection = await this.connectionsRepository.findOne({
      where: { id, organizationId },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    const config = this.encryptionService.decryptObject<ConnectionConfig>(connection.config);
    const driver = this.createDriver(connection.type);

    await driver.connect(config);

    return driver;
  }

  /**
   * Get full connection config (including credentials) for internal use only
   * Do NOT expose this through the API - use toResponseDto for API responses
   */
  async getConnectionConfig(id: string, organizationId: string): Promise<{ connection: Connection; config: ConnectionConfig }> {
    const connection = await this.connectionsRepository.findOne({
      where: { id, organizationId },
    });

    if (!connection) {
      throw new NotFoundException(`Connection with ID ${id} not found`);
    }

    const config = this.encryptionService.decryptObject<ConnectionConfig>(connection.config);

    return { connection, config };
  }

  private buildConfig(dto: CreateConnectionDto): ConnectionConfig {
    return {
      host: dto.host || '',
      port: dto.port || 0,
      username: dto.username || '',
      password: dto.password || '',
      database: dto.database,
      ssl: dto.ssl || false,
      warehouse: dto.warehouse,
      keyFile: dto.keyFile,
    };
  }

  private async testConnectionConfig(dto: CreateConnectionDto): Promise<void> {
    const config = this.buildConfig(dto);

    try {
      const driver = this.createDriver(dto.type);
      await driver.connect(config);
      await driver.testConnection();
      await driver.disconnect();
    } catch (error) {
      throw new BadRequestException(`Connection test failed: ${error.message}`);
    }
  }

  private createDriver(type: string): DatabaseDriver {
    switch (type) {
      case 'postgresql':
        return new PostgresDriver();
      case 'mysql':
        return new MySQLDriver();
      case 'redshift':
        return new RedshiftDriver();
      case 'snowflake':
        return new SnowflakeDriver();
      case 'bigquery':
        return new BigQueryDriver();
      default:
        throw new BadRequestException(`Unsupported database type: ${type}`);
    }
  }

  private toResponseDto(connection: Connection, config: ConnectionConfig): ConnectionResponseDto {
    return {
      id: connection.id,
      name: connection.name,
      type: connection.type,
      host: config.host || undefined,
      port: config.port || undefined,
      database: config.database,
      ssl: config.ssl || false,
      warehouse: config.warehouse,
      createdAt: connection.createdAt,
    };
  }
}
