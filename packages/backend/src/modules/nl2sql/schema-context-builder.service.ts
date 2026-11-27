import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Connection } from '../../database/entities/connection.entity';
import { SchemaContext, ConnectionSchema, TableSchema, ColumnSchema } from '../ai/providers/base-provider.interface';
import { SchemaService } from '../schema/schema.service';

/**
 * Schema Context Builder Service
 *
 * Builds schema context for AI providers by fetching:
 * - Connection metadata
 * - Table schemas
 * - Column details
 * - Relationships (foreign keys)
 * - Sample data (optional)
 */
@Injectable()
export class SchemaContextBuilderService {
  private readonly logger = new Logger(SchemaContextBuilderService.name);

  constructor(
    @InjectRepository(Connection)
    private connectionRepository: Repository<Connection>,
    private schemaService: SchemaService
  ) {}

  /**
   * Build schema context for specified connections
   */
  async buildContext(
    organizationId: string,
    connectionIds?: string[],
    options?: {
      includeSampleData?: boolean;
      maxTablesPerConnection?: number;
      maxColumnsPerTable?: number;
    }
  ): Promise<SchemaContext> {
    this.logger.log(`Building schema context for organization ${organizationId}`);

    const {
      includeSampleData = false,
      maxTablesPerConnection = 20,
      maxColumnsPerTable = 50,
    } = options || {};

    // Fetch connections
    const whereClause: any = { organizationId };
    if (connectionIds && connectionIds.length > 0) {
      whereClause.id = In(connectionIds);
    }

    const connections = await this.connectionRepository.find({
      where: whereClause,
      order: { name: 'ASC' },
    });

    if (connections.length === 0) {
      this.logger.warn('No connections found for schema context');
      return { connections: [] };
    }

    // Build schema for each connection
    const connectionSchemas: ConnectionSchema[] = [];

    for (const connection of connections) {
      try {
        const schema = await this.buildConnectionSchema(
          connection,
          { includeSampleData, maxTablesPerConnection, maxColumnsPerTable }
        );
        connectionSchemas.push(schema);
      } catch (error) {
        this.logger.error(`Failed to build schema for connection ${connection.id}:`, error);
        // Continue with other connections
        connectionSchemas.push({
          connectionId: connection.id,
          connectionName: connection.name,
          databaseType: connection.type,
          tables: [],
        });
      }
    }

    return { connections: connectionSchemas };
  }

  /**
   * Build schema for a single connection
   */
  private async buildConnectionSchema(
    connection: Connection,
    options: {
      includeSampleData: boolean;
      maxTablesPerConnection: number;
      maxColumnsPerTable: number;
    }
  ): Promise<ConnectionSchema> {
    const { maxTablesPerConnection, maxColumnsPerTable } = options;

    // Get tables for this connection
    const tablesResponse = await this.schemaService.getTables(connection.id, connection.organizationId);
    const tables = tablesResponse.slice(0, maxTablesPerConnection);

    const tableSchemas: TableSchema[] = [];

    for (const table of tables) {
      try {
        // Get columns for this table
        const columnsResponse = await this.schemaService.getColumns(
          connection.id,
          connection.organizationId,
          table.name,
          table.schema
        );
        const columns = columnsResponse.slice(0, maxColumnsPerTable);

        const columnSchemas: ColumnSchema[] = columns.map(col => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          primaryKey: col.isPrimaryKey || false,
        }));

        tableSchemas.push({
          name: table.name,
          schema: table.schema,
          columns: columnSchemas,
        });
      } catch (error) {
        this.logger.warn(`Failed to load columns for ${table.schema}.${table.name}: ${error.message}`);
        this.logger.error(`Failed to build schema for table ${table.name}:`, error);
        // Continue with other tables
      }
    }

    return {
      connectionId: connection.id,
      connectionName: connection.name,
      databaseType: connection.type,
      tables: tableSchemas,
    };
  }

  /**
   * Build simplified schema context for a single connection
   * (useful for quick queries where full context is not needed)
   */
  async buildSimplifiedContext(
    connectionId: string,
    tableNames?: string[]
  ): Promise<SchemaContext> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId },
    });

    if (!connection) {
      return { connections: [] };
    }

    const tablesResponse = await this.schemaService.getTables(connectionId, connection.organizationId);
    let tables = tablesResponse;

    if (tableNames && tableNames.length > 0) {
      tables = tables.filter(t => tableNames.includes(t.name));
    }

    const tableSchemas: TableSchema[] = [];

    for (const table of tables.slice(0, 10)) {
      const columnsResponse = await this.schemaService.getColumns(
        connectionId,
        connection.organizationId,
        table.name,
        table.schema
      );

      const columnSchemas: ColumnSchema[] = columnsResponse.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.nullable,
        primaryKey: col.isPrimaryKey || false,
      }));

      tableSchemas.push({
        name: table.name,
        schema: table.schema,
        columns: columnSchemas,
      });
    }

    return {
      connections: [
        {
          connectionId: connection.id,
          connectionName: connection.name,
          databaseType: connection.type,
          tables: tableSchemas,
        },
      ],
    };
  }
}
