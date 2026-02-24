import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import {
  OrganizationSettings,
} from '../../database/entities/organization-settings.entity';
import {
  Transformation,
  Pipeline,
  QueryHistory,
} from '../../database/entities';
import { EncryptionService } from '../encryption/encryption.service';
import { ConnectionsService } from '../connections/connections.service';
import { SchemaService } from '../schema/schema.service';
import { LineageBuilderService } from '../lineage/lineage-builder.service';
import { OpenMetadataClientService } from './openmetadata-client.service';
import { SyncResult } from './dto/sync-result.dto';

// OM service type mapping
const OM_SERVICE_TYPE: Record<string, string> = {
  postgresql: 'Postgres',
  mysql: 'Mysql',
  redshift: 'Redshift',
  snowflake: 'Snowflake',
  bigquery: 'BigQuery',
  mongodb: 'MongoDB',
  sqlserver: 'Mssql',
  clickhouse: 'Clickhouse',
  sqlite: 'SQLite',
};

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectRepository(OrganizationSettings)
    private settingsRepo: Repository<OrganizationSettings>,
    @InjectRepository(Transformation)
    private transformationRepo: Repository<Transformation>,
    @InjectRepository(Pipeline)
    private pipelineRepo: Repository<Pipeline>,
    @InjectRepository(QueryHistory)
    private queryHistoryRepo: Repository<QueryHistory>,
    private encryptionService: EncryptionService,
    private connectionsService: ConnectionsService,
    private schemaService: SchemaService,
    private lineageBuilderService: LineageBuilderService,
    private omClient: OpenMetadataClientService,
  ) {}

  /** Load, validate and configure the OM client. Returns decrypted config or throws. */
  async loadAndConfigure(organizationId: string) {
    const settings = await this.settingsRepo.findOne({ where: { organizationId } });
    const cfg = settings?.catalogConfig;

    if (!cfg?.enabled || !cfg.host || !cfg.jwtToken) {
      throw new BadRequestException(
        'Catalog integration is not configured or disabled. Configure it in Settings first.',
      );
    }

    const token = this.encryptionService.decrypt(cfg.jwtToken);
    this.omClient.configure(cfg.host, token);
    return cfg;
  }

  async testConnection(organizationId: string): Promise<{ ok: boolean; message: string }> {
    try {
      await this.loadAndConfigure(organizationId);
      await this.omClient.testConnectivity();
      return { ok: true, message: 'Connected to OpenMetadata successfully.' };
    } catch (err: any) {
      return { ok: false, message: err?.response?.data?.message ?? err.message };
    }
  }

  async getStatus(organizationId: string) {
    const settings = await this.settingsRepo.findOne({ where: { organizationId } });
    const cfg = settings?.catalogConfig;
    if (!cfg) return { configured: false };
    return {
      configured: true,
      provider: cfg.provider,
      host: cfg.host,
      enabled: cfg.enabled,
      lastSyncAt: cfg.lastSyncAt ?? null,
      lastSyncResult: cfg.lastSyncResult ?? null,
    };
  }

  async syncAll(organizationId: string): Promise<SyncResult> {
    await this.loadAndConfigure(organizationId);

    const result = new SyncResult();

    result.add(await this.syncConnections(organizationId));
    result.add(await this.syncSchemas(organizationId));
    result.add(await this.syncPipelines(organizationId));
    result.add(await this.syncLineage(organizationId));
    result.add(await this.syncQueryUsage(organizationId));

    // Persist sync result
    await this.settingsRepo
      .createQueryBuilder()
      .update(OrganizationSettings)
      .set({
        catalogConfig: () =>
          `jsonb_set(jsonb_set(
            COALESCE("catalog_config", '{}'::jsonb),
            '{lastSyncAt}',
            '"${new Date().toISOString()}"'
          ), '{lastSyncResult}', '${JSON.stringify({ created: result.created, updated: result.updated, errors: result.errors })}'::jsonb)`,
      })
      .where('organization_id = :organizationId', { organizationId })
      .execute();

    this.logger.log(
      `Catalog sync done for org ${organizationId}: +${result.created} created, ${result.updated} updated, ${result.errors.length} errors`,
    );
    return result;
  }

  // ─── Partial syncs (also callable from event hooks) ─────────────────────────

  async syncConnections(organizationId: string): Promise<SyncResult> {
    const result = new SyncResult();
    try {
      const connections = await this.connectionsService.findAll(organizationId);
      for (const conn of connections) {
        try {
          await this.omClient.upsertDatabaseService(`datagate.${conn.id}`, {
            name: `datagate-${conn.id}`,
            displayName: conn.name,
            serviceType: OM_SERVICE_TYPE[conn.type] ?? 'CustomDatabase',
            connection: {
              config: {
                type: OM_SERVICE_TYPE[conn.type] ?? 'CustomDatabase',
                hostPort: `${conn.host ?? 'unknown'}:${conn.port ?? 5432}`,
                database: conn.database,
              },
            },
          });
          result.updated++;
        } catch (err: any) {
          result.errors.push(`connection ${conn.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`syncConnections: ${err.message}`);
    }
    return result;
  }

  async syncSchemas(organizationId: string): Promise<SyncResult> {
    const result = new SyncResult();
    try {
      const connections = await this.connectionsService.findAll(organizationId);
      for (const conn of connections) {
        try {
          const schemas = await this.schemaService.getSchemas(conn.id, organizationId);
          for (const schema of schemas) {
            // Upsert Database
            try {
              await this.omClient.upsertDatabase({
                name: schema.name,
                service: `datagate-${conn.id}`,
                displayName: schema.name,
              });
              result.updated++;
            } catch (err: any) {
              result.errors.push(`database ${conn.id}.${schema.name}: ${err.message}`);
            }

            // Upsert Tables
            let tables: Awaited<ReturnType<SchemaService['getTables']>>;
            try {
              tables = await this.schemaService.getTables(conn.id, organizationId, schema.name);
            } catch {
              continue;
            }

            for (const table of tables) {
              try {
                let columns: Awaited<ReturnType<SchemaService['getColumns']>> = [];
                try {
                  columns = await this.schemaService.getColumns(
                    conn.id,
                    organizationId,
                    table.name,
                    schema.name,
                  );
                } catch {
                  // columns optional
                }

                await this.omClient.upsertTable({
                  name: table.name,
                  databaseSchema: `datagate-${conn.id}.${schema.name}`,
                  displayName: table.name,
                  tableType: table.type === 'view' ? 'View' : 'Regular',
                  columns: columns.map((col) => ({
                    name: col.name,
                    dataType: col.type.toUpperCase(),
                    dataTypeDisplay: col.type,
                    constraint: col.isPrimaryKey ? 'PRIMARY_KEY' : col.nullable ? 'NULL' : 'NOT_NULL',
                  })),
                });
                result.updated++;
              } catch (err: any) {
                result.errors.push(`table ${conn.id}.${schema.name}.${table.name}: ${err.message}`);
              }
            }
          }
        } catch (err: any) {
          result.errors.push(`syncSchemas conn ${conn.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`syncSchemas: ${err.message}`);
    }
    return result;
  }

  async syncPipelines(organizationId: string): Promise<SyncResult> {
    const result = new SyncResult();
    try {
      // Ensure pipeline service exists
      await this.omClient.upsertPipelineService({
        name: 'datagate-pipelines',
        displayName: 'DataGate Pipelines',
        serviceType: 'CustomPipeline',
        connection: { config: { type: 'CustomPipeline' } },
      });

      const transformations = await this.transformationRepo.find({ where: { organizationId } });
      for (const t of transformations) {
        try {
          await this.omClient.upsertPipeline({
            name: `transformation-${t.id}`,
            displayName: t.name,
            service: 'datagate-pipelines',
            description: t.description ?? '',
          });
          result.updated++;
        } catch (err: any) {
          result.errors.push(`transformation ${t.id}: ${err.message}`);
        }
      }

      const pipelines = await this.pipelineRepo.find({ where: { organizationId } });
      for (const p of pipelines) {
        try {
          await this.omClient.upsertPipeline({
            name: `pipeline-${p.id}`,
            displayName: p.name,
            service: 'datagate-pipelines',
            description: p.description ?? '',
            pipelineStatus: p.status === 'active' ? 'Successful' : 'Skipped',
          });
          result.updated++;
        } catch (err: any) {
          result.errors.push(`pipeline ${p.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`syncPipelines: ${err.message}`);
    }
    return result;
  }

  async syncLineage(organizationId: string): Promise<SyncResult> {
    const result = new SyncResult();
    try {
      const graph = await this.lineageBuilderService.buildLineageGraph(organizationId, {});
      for (const edge of graph.edges) {
        try {
          await this.omClient.putLineage({
            edge: {
              fromEntity: { id: edge.source, type: 'table' },
              toEntity: { id: edge.target, type: 'table' },
            },
          });
          result.updated++;
        } catch (err: any) {
          result.errors.push(`lineage edge ${edge.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`syncLineage: ${err.message}`);
    }
    return result;
  }

  async syncQueryUsage(organizationId: string): Promise<SyncResult> {
    const result = new SyncResult();
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const queries = await this.queryHistoryRepo.find({
        where: { organizationId, executedAt: MoreThan(since) } as any,
        order: { executedAt: 'DESC' },
        take: 500,
      });

      // Batch in groups of 100
      for (let i = 0; i < queries.length; i += 100) {
        const batch = queries.slice(i, i + 100);
        for (const q of batch) {
          try {
            await this.omClient.postQueryHistory({
              query: { query: q.sqlQuery },
              queryDate: new Date(q.executedAt).getTime(),
              duration: q.executionTimeMs,
            });
            result.updated++;
          } catch {
            // query history sync is best-effort — skip individual failures silently
          }
        }
      }
    } catch (err: any) {
      result.errors.push(`syncQueryUsage: ${err.message}`);
    }
    return result;
  }
}
