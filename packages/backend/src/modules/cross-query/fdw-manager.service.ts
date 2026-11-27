import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { FdwServer } from '../../database/entities/fdw-server.entity';
import { ConnectionsService } from '../connections/connections.service';
import { QueryDefinitionDto } from './dto/query-definition.dto';
import { v4 as uuidv4 } from 'uuid';

const SAFE_SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validates a plain SQL identifier (schema or table name component).
 * Foreign/materialized table names are always generated internally as
 * `ft_<alias>_<timestamp>`, but the alias segment can originate from
 * user-supplied query definitions, so it is validated before being used
 * in a DROP/CREATE statement (SEC-05).
 */
export function assertSafeSqlIdentifier(identifier: string): string {
  if (
    !identifier ||
    identifier.length > 128 ||
    !SAFE_SQL_IDENTIFIER.test(identifier)
  ) {
    throw new BadRequestException(`Invalid identifier: ${identifier}`);
  }
  return identifier;
}

@Injectable()
export class FdwManagerService {
  private readonly logger = new Logger(FdwManagerService.name);

  constructor(
    @InjectRepository(FdwServer)
    private fdwServerRepository: Repository<FdwServer>,
    private connectionsService: ConnectionsService,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {}

  /**
   * Ensure FDW extensions are installed in the metadata database
   */
  async ensureFdwExtensions(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // Install postgres_fdw (for PostgreSQL connections)
      await queryRunner.query('CREATE EXTENSION IF NOT EXISTS postgres_fdw');

      this.logger.log('FDW extensions ensured successfully');
    } catch (error) {
      this.logger.error('Failed to install FDW extensions', error);
      throw new InternalServerErrorException(
        'Database does not support required FDW extensions',
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Setup FDW server for a connection
   */
  async setupFdwServer(
    connectionId: string,
    organizationId: string,
  ): Promise<FdwServer> {
    // Check if FDW server already exists
    const existing = await this.fdwServerRepository.findOne({
      where: { connectionId, organizationId },
    });

    if (existing) {
      return existing;
    }

    // Get connection details with full config (including credentials)
    const { connection, config } = await this.connectionsService.getConnectionConfig(
      connectionId,
      organizationId,
    );

    // Only SQL-based connection types can participate in cross-queries via FDW.
    // NoSQL databases (MongoDB, etc.) have no PostgreSQL FDW adapter.
    const FDW_TYPE_MAP: Partial<Record<string, string>> = {
      postgresql: 'postgres_fdw',
      redshift: 'postgres_fdw',
      mysql: 'mysql_fdw',
      sqlserver: 'tds_fdw',
    };
    const fdwType = FDW_TYPE_MAP[connection.type];
    if (!fdwType) {
      throw new BadRequestException(
        `Connection type "${connection.type}" cannot be used in cross-queries. ` +
        `Only SQL-compatible connections (PostgreSQL, MySQL, Redshift) support FDW-based joins. ` +
        `For MongoDB and other NoSQL databases, use the Query page instead.`,
      );
    }

    // Generate unique server name (org-scoped)
    const serverName = `org_${organizationId}_conn_${connectionId}`
      .replace(/-/g, '_')
      .substring(0, 63); // PostgreSQL identifier limit

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // Create FDW server
      const fdwType = FDW_TYPE_MAP[connection.type]!;

      await queryRunner.query(`
        CREATE SERVER IF NOT EXISTS ${this.quoteIdent(serverName)}
        FOREIGN DATA WRAPPER ${fdwType}
        OPTIONS (
          host ${this.quoteLiteral(config.host)},
          port ${this.quoteLiteral(config.port.toString())},
          dbname ${this.quoteLiteral(config.database)}
          ${config.ssl ? ", sslmode 'require'" : ''}
        )
      `);

      // Create user mapping (metadata DB user -> remote DB user)
      const metadataUser = this.configService.get('DB_USERNAME');

      await queryRunner.query(`
        CREATE USER MAPPING IF NOT EXISTS
        FOR ${this.quoteIdent(metadataUser)}
        SERVER ${this.quoteIdent(serverName)}
        OPTIONS (
          user ${this.quoteLiteral(config.username)},
          password ${this.quoteLiteral(config.password)}
        )
      `);

      // Save FDW server record
      const fdwServer = this.fdwServerRepository.create({
        id: uuidv4(),
        connectionId,
        serverName,
        fdwType,
        organizationId,
        active: true,
      });

      const saved = await this.fdwServerRepository.save(fdwServer);

      this.logger.log(
        `FDW server created: ${serverName} for connection ${connectionId}`,
      );

      return saved;
    } catch (error) {
      this.logger.error(
        `Failed to setup FDW server for connection ${connectionId}`,
        error,
      );
      // Include actual error message for debugging
      throw new BadRequestException(
        `Failed to setup FDW server: ${error.message || error}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Teardown FDW server
   */
  async teardownFdwServer(
    serverId: string,
    organizationId: string,
  ): Promise<void> {
    const fdwServer = await this.fdwServerRepository.findOne({
      where: { id: serverId, organizationId },
    });

    if (!fdwServer) {
      throw new NotFoundException('FDW server not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      // Drop all foreign tables in organization schema that use this server
      await this.dropForeignTablesForServer(
        fdwServer.serverName,
        organizationId,
        queryRunner,
      );

      // Drop user mapping
      const metadataUser = this.configService.get('DB_USERNAME');
      await queryRunner.query(`
        DROP USER MAPPING IF EXISTS
        FOR ${this.quoteIdent(metadataUser)}
        SERVER ${this.quoteIdent(fdwServer.serverName)}
      `);

      // Drop server
      await queryRunner.query(`
        DROP SERVER IF EXISTS ${this.quoteIdent(fdwServer.serverName)} CASCADE
      `);

      // Delete record
      await this.fdwServerRepository.delete(fdwServer.id);

      this.logger.log(`FDW server deleted: ${fdwServer.serverName}`);
    } catch (error) {
      this.logger.error(
        `Failed to teardown FDW server ${fdwServer.serverName}`,
        error,
      );
      throw new BadRequestException(
        `Failed to teardown FDW server: ${error.message || error}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Create foreign tables for a query definition
   */
  async createForeignTablesForQuery(
    queryDef: QueryDefinitionDto,
    organizationId: string,
  ): Promise<Map<string, string>> {
    const queryRunner = this.dataSource.createQueryRunner();
    const foreignTableMap = new Map<string, string>();

    try {
      await queryRunner.connect();

      // Ensure organization schema exists
      const orgSchema = `fdw_org_${organizationId}`.replace(/-/g, '_');
      await queryRunner.query(
        `CREATE SCHEMA IF NOT EXISTS ${this.quoteIdent(orgSchema)}`,
      );

      for (const table of queryDef.tables) {
        // Check if this is a staging table (already in metadata database)
        if (table.connectionId === 'staging') {
          // Staging tables don't need FDW - they're already in the same database
          const stagingTableName = `${this.quoteIdent(table.schemaName)}.${this.quoteIdent(table.tableName)}`;
          foreignTableMap.set(table.alias, stagingTableName);

          this.logger.log(
            `Using staging table: ${stagingTableName} for ${table.alias}`,
          );
          continue;
        }

        // Determine if this connection type supports FDW
        const { connection: conn } = await this.connectionsService.getConnectionConfig(
          table.connectionId,
          organizationId,
        );

        if (!FdwManagerService.FDW_TYPES.has(conn.type)) {
          // Non-FDW connection (MongoDB, BigQuery, Snowflake, ClickHouse, SQLite):
          // materialize data into a temporary PostgreSQL table and join from there.
          const localTableName = `ft_${table.alias}_${Date.now()}`;
          const sourceQuery =
            table.sourceQuery ??
            this.defaultSourceQuery(conn.type, table.schemaName, table.tableName);
          try {
            await this.materializeTable(
              queryRunner,
              table.connectionId,
              organizationId,
              sourceQuery,
              orgSchema,
              localTableName,
            );
            foreignTableMap.set(
              table.alias,
              `${this.quoteIdent(orgSchema)}.${this.quoteIdent(localTableName)}`,
            );
            this.logger.log(
              `Materialized ${conn.type} table as ${orgSchema}.${localTableName} for ${table.alias}`,
            );
          } catch (error) {
            this.logger.error(`Failed to materialize ${conn.type} table ${table.tableName}`, error);
            throw new BadRequestException(
              `Failed to materialize data from ${conn.type} connection: ${error.message}`,
            );
          }
          continue;
        }

        // Get or create FDW server for this connection
        let fdwServer = await this.fdwServerRepository.findOne({
          where: { connectionId: table.connectionId, organizationId },
        });

        if (!fdwServer) {
          fdwServer = await this.setupFdwServer(
            table.connectionId,
            organizationId,
          );
        }

        // Generate unique foreign table name
        const foreignTableName = `ft_${table.alias}_${Date.now()}`;
        const fullyQualifiedName = `${orgSchema}.${foreignTableName}`;

        try {
          // Get table structure from remote database and create foreign table manually
          // This allows us to map custom types (enums, etc.) to standard types
          await this.createForeignTableManually(
            queryRunner,
            fdwServer.serverName,
            table.schemaName,
            table.tableName,
            orgSchema,
            foreignTableName,
          );

          foreignTableMap.set(table.alias, fullyQualifiedName);

          this.logger.log(
            `Foreign table created: ${fullyQualifiedName} for ${table.tableName}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to create foreign table for ${table.tableName}`,
            error,
          );
          throw new BadRequestException(
            `Failed to create foreign table for ${table.tableName}: ${error.message}`,
          );
        }
      }

      return foreignTableMap;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cleanup foreign tables
   */
  async cleanupForeignTables(
    foreignTableMap: Map<string, string>,
    orgSchema: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();

      for (const tableName of foreignTableMap.values()) {
        let quotedName: string;
        try {
          // tableName is schema-qualified (e.g. `fdw_org_x.ft_<alias>_<ts>`);
          // validate and quote each component separately (SEC-05).
          quotedName = this.quoteQualifiedIdent(tableName);
        } catch (error) {
          this.logger.warn(
            `Skipping drop for invalid table identifier ${tableName}`,
            error,
          );
          continue;
        }

        try {
          // Try as a foreign table first (FDW path)
          await queryRunner.query(
            `DROP FOREIGN TABLE IF EXISTS ${quotedName}`,
          );
          this.logger.log(`Dropped foreign table: ${tableName}`);
        } catch {
          // Fall back to regular table drop (materialization path)
          try {
            await queryRunner.query(`DROP TABLE IF EXISTS ${quotedName}`);
            this.logger.log(`Dropped materialized table: ${tableName}`);
          } catch (error) {
            this.logger.warn(`Failed to drop table ${tableName}`, error);
          }
        }
      }
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Drop all foreign tables for a specific FDW server
   */
  private async dropForeignTablesForServer(
    serverName: string,
    organizationId: string,
    queryRunner: any,
  ): Promise<void> {
    const orgSchema = `fdw_org_${organizationId}`.replace(/-/g, '_');

    // Get all foreign tables in the organization schema
    const result = await queryRunner.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = ${this.quoteLiteral(orgSchema)}
      AND tablename LIKE 'ft_%'
    `);

    for (const row of result) {
      try {
        await queryRunner.query(
          `DROP FOREIGN TABLE IF EXISTS ${orgSchema}.${this.quoteIdent(row.tablename)}`,
        );
      } catch (error) {
        this.logger.warn(`Failed to drop foreign table ${row.tablename}`, error);
      }
    }
  }

  /**
   * Create foreign table manually by querying remote schema
   * This allows mapping custom types (enums, etc.) to standard types
   */
  private async createForeignTableManually(
    queryRunner: any,
    serverName: string,
    remoteSchema: string,
    remoteTable: string,
    localSchema: string,
    localTableName: string,
  ): Promise<void> {
    const maxRetries = 10; // Prevent infinite loops
    let attempt = 0;
    let lastError: any = null;

    // Keep retrying until all missing types are created
    while (attempt < maxRetries) {
      try {
        await queryRunner.query(`
          IMPORT FOREIGN SCHEMA ${this.quoteIdent(remoteSchema)}
          LIMIT TO (${this.quoteIdent(remoteTable)})
          FROM SERVER ${this.quoteIdent(serverName)}
          INTO ${this.quoteIdent(localSchema)}
          OPTIONS (import_default 'true')
        `);

        // Rename imported table to our naming convention
        await queryRunner.query(`
          ALTER FOREIGN TABLE ${localSchema}.${this.quoteIdent(remoteTable)}
          RENAME TO ${this.quoteIdent(localTableName)}
        `);

        // Success! Exit the loop
        return;
      } catch (error) {
        lastError = error;

        // If import fails due to missing type, extract type name and create it
        const typeMatch = error.message.match(/type "([^"]+)" does not exist/);

        if (typeMatch) {
          const missingType = typeMatch[1];
          this.logger.log(
            `Missing type ${missingType}, creating as TEXT domain for compatibility`,
          );

          // Create the missing type as a text domain (simpler than recreating enums)
          // Remove schema prefix if present (e.g., "public.vehicles_bodytype_enum" -> "vehicles_bodytype_enum")
          const typeName = missingType.includes('.')
            ? missingType.split('.')[1]
            : missingType;

          try {
            await queryRunner.query(`
              CREATE DOMAIN ${this.quoteIdent(typeName)} AS TEXT
            `);
            this.logger.log(`Created domain type: ${typeName}`);
          } catch (domainError) {
            // Domain might already exist, ignore
            if (!domainError.message.includes('already exists')) {
              throw domainError;
            }
          }

          // Increment attempt and retry
          attempt++;
        } else {
          // Different error - not a missing type issue
          throw error;
        }
      }
    }

    // If we exhausted all retries, throw the last error
    throw new Error(
      `Failed to import table ${remoteTable} after ${maxRetries} attempts. ` +
      `Last error: ${lastError.message}`,
    );
  }

  /**
   * Connection types that support FDW-based cross-queries
   */
  private static readonly FDW_TYPES = new Set([
    'postgresql',
    'redshift',
    'mysql',
    'sqlserver',
  ]);

  /**
   * Materialize data from a non-FDW connection into a temporary PostgreSQL table
   * so it can participate in cross-database JOINs.
   */
  private async materializeTable(
    queryRunner: any,
    connectionId: string,
    organizationId: string,
    sourceQuery: string,
    orgSchema: string,
    localTableName: string,
  ): Promise<void> {
    const driver = await this.connectionsService.getDriver(connectionId, organizationId);
    let result: { rows: any[]; fields: Array<{ name: string; type: string }> };

    try {
      result = await driver.query(sourceQuery);
    } finally {
      await driver.disconnect().catch(() => {});
    }

    const { rows, fields } = result;

    // Derive column names from fields (or first row keys as fallback)
    const columnNames: string[] =
      fields.length > 0
        ? fields.map((f) => f.name)
        : rows.length > 0
          ? Object.keys(rows[0])
          : [];

    if (columnNames.length === 0) {
      throw new BadRequestException(
        `Source query returned no columns from connection ${connectionId}`,
      );
    }

    // Create temporary table with all columns as TEXT
    const colDefs = columnNames
      .map((c) => `${this.quoteIdent(c)} TEXT`)
      .join(', ');
    await queryRunner.query(
      `CREATE TABLE ${this.quoteIdent(orgSchema)}.${this.quoteIdent(localTableName)} (${colDefs})`,
    );

    if (rows.length === 0) {
      this.logger.log(`Materialized empty table ${localTableName} (0 rows)`);
      return;
    }

    // Bulk INSERT in batches of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const placeholders: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const row of batch) {
        const rowPlaceholders = columnNames.map(() => `$${paramIdx++}`);
        placeholders.push(`(${rowPlaceholders.join(', ')})`);
        for (const col of columnNames) {
          const val = row[col];
          values.push(val === null || val === undefined ? null : String(val));
        }
      }

      await queryRunner.query(
        `INSERT INTO ${this.quoteIdent(orgSchema)}.${this.quoteIdent(localTableName)} VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    this.logger.log(
      `Materialized ${rows.length} rows from connection ${connectionId} into ${orgSchema}.${localTableName}`,
    );
  }

  /**
   * Generate a default source query for non-FDW connections
   */
  private defaultSourceQuery(
    type: string,
    schemaName: string,
    tableName: string,
  ): string {
    if (type === 'mongodb') {
      return JSON.stringify({ collection: tableName, filter: {}, limit: 10000 });
    }
    const fqTable = schemaName
      ? `${this.quoteIdent(schemaName)}.${this.quoteIdent(tableName)}`
      : this.quoteIdent(tableName);
    return `SELECT * FROM ${fqTable} LIMIT 10000`;
  }

  /**
   * Quote PostgreSQL identifier
   */
  private quoteIdent(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Validates and double-quotes a possibly schema-qualified identifier
   * (e.g. "schema.table"), validating and quoting each component
   * separately (SEC-05).
   */
  private quoteQualifiedIdent(qualifiedName: string): string {
    return qualifiedName
      .split('.')
      .map((part) => this.quoteIdent(assertSafeSqlIdentifier(part)))
      .join('.');
  }

  /**
   * Quote PostgreSQL literal
   */
  private quoteLiteral(literal: string): string {
    return `'${literal.replace(/'/g, "''")}'`;
  }
}
