import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Connection } from '../../database/entities/connection.entity';
import {
  SchemaContext,
  ConnectionSchema,
  TableSchema,
  ColumnSchema,
  RelationshipSchema,
} from '../ai/providers/base-provider.interface';
import { SchemaService } from '../schema/schema.service';
import { ConnectionsService } from '../connections/connections.service';
import { DatabaseDriver } from '../connections/drivers/database-driver.interface';

/** Database types that support the information_schema queries used for enrichment. */
const ENRICHABLE_TYPES = new Set(['postgresql', 'mysql']);

/** Identifier validation for interpolated schema/table names (Phase 0 rule). */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const MAX_RELATIONSHIPS_PER_CONNECTION = 100;
const MAX_SAMPLE_TABLES = 10;
const MAX_SAMPLE_ROWS = 3;

const POSTGRES_FK_QUERY = `
  SELECT tc.table_schema, tc.table_name, kcu.column_name,
         ccu.table_schema AS foreign_table_schema, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' LIMIT ${MAX_RELATIONSHIPS_PER_CONNECTION}
`;

const MYSQL_FK_QUERY = `
  SELECT TABLE_SCHEMA AS table_schema, TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
         REFERENCED_TABLE_SCHEMA AS foreign_table_schema, REFERENCED_TABLE_NAME AS foreign_table_name, REFERENCED_COLUMN_NAME AS foreign_column_name
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE REFERENCED_TABLE_NAME IS NOT NULL LIMIT ${MAX_RELATIONSHIPS_PER_CONNECTION}
`;

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
    private schemaService: SchemaService,
    private connectionsService: ConnectionsService
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
    const { maxTablesPerConnection, maxColumnsPerTable, includeSampleData } = options;

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

    await this.enrichWithRelationshipsAndSampleData(connection, tableSchemas, includeSampleData);

    return {
      connectionId: connection.id,
      connectionName: connection.name,
      databaseType: connection.type,
      tables: tableSchemas,
    };
  }

  /**
   * Enrich table schemas with foreign-key relationships and (optionally) sample rows.
   * Only runs for connection types that expose an `information_schema` (postgresql/mysql).
   * All failures are warn-logged and non-fatal — enrichment is best-effort.
   */
  private async enrichWithRelationshipsAndSampleData(
    connection: Connection,
    tableSchemas: TableSchema[],
    includeSampleData: boolean
  ): Promise<void> {
    if (!ENRICHABLE_TYPES.has(connection.type)) {
      return;
    }

    let driver: DatabaseDriver | undefined;
    try {
      driver = await this.connectionsService.getDriver(connection.id, connection.organizationId);
    } catch (error) {
      this.logger.warn(`Failed to open driver for schema enrichment on connection ${connection.id}: ${error.message}`);
      return;
    }

    if (!driver) {
      this.logger.warn(`No driver available for schema enrichment on connection ${connection.id}`);
      return;
    }

    try {
      try {
        const relationships = await this.fetchRelationships(driver, connection.type);
        this.attachRelationships(tableSchemas, relationships);
      } catch (error) {
        this.logger.warn(`Failed to fetch relationships for connection ${connection.id}: ${error.message}`);
      }

      if (includeSampleData) {
        for (const table of tableSchemas.slice(0, MAX_SAMPLE_TABLES)) {
          try {
            table.sampleData = await this.fetchSampleRows(driver, table);
          } catch (error) {
            this.logger.warn(
              `Failed to fetch sample rows for ${table.schema ? table.schema + '.' : ''}${table.name}: ${error.message}`
            );
          }
        }
      }
    } finally {
      await driver.disconnect();
    }
  }

  /**
   * Query information_schema for foreign-key constraints and map to RelationshipSchema.
   * Capped at MAX_RELATIONSHIPS_PER_CONNECTION rows.
   */
  private async fetchRelationships(driver: DatabaseDriver, databaseType: string): Promise<RelationshipSchema[]> {
    const sql = databaseType === 'mysql' ? MYSQL_FK_QUERY : POSTGRES_FK_QUERY;
    const result = await driver.query(sql);
    const rows = result.rows || [];

    return rows.slice(0, MAX_RELATIONSHIPS_PER_CONNECTION).map((row: any) => ({
      type: 'many-to-one' as const,
      sourceTable: row.table_name,
      targetTable: row.foreign_table_name,
      sourceColumn: row.column_name,
      targetColumn: row.foreign_column_name,
    }));
  }

  /**
   * Group relationships by their source table and attach them to the matching TableSchema.
   */
  private attachRelationships(tableSchemas: TableSchema[], relationships: RelationshipSchema[]): void {
    if (relationships.length === 0) {
      return;
    }

    const bySourceTable = new Map<string, RelationshipSchema[]>();
    for (const relationship of relationships) {
      const existing = bySourceTable.get(relationship.sourceTable) || [];
      existing.push(relationship);
      bySourceTable.set(relationship.sourceTable, existing);
    }

    for (const table of tableSchemas) {
      const matches = bySourceTable.get(table.name);
      if (matches && matches.length > 0) {
        table.relationships = matches;
      }
    }
  }

  /**
   * Fetch up to MAX_SAMPLE_ROWS rows from a table. Skips (with a warning) any table whose
   * schema/table name fails identifier validation, to prevent SQL injection via interpolation.
   */
  private async fetchSampleRows(
    driver: DatabaseDriver,
    table: TableSchema
  ): Promise<Record<string, any>[] | undefined> {
    if (!IDENTIFIER_RE.test(table.name) || (table.schema && !IDENTIFIER_RE.test(table.schema))) {
      this.logger.warn(
        `Skipping sample data for table with invalid identifier: ${table.schema ? table.schema + '.' : ''}${table.name}`
      );
      return undefined;
    }

    const qualifiedName = table.schema ? `"${table.schema}"."${table.name}"` : `"${table.name}"`;
    const result = await driver.query(`SELECT * FROM ${qualifiedName} LIMIT ${MAX_SAMPLE_ROWS}`);
    return (result.rows || []).slice(0, MAX_SAMPLE_ROWS);
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
