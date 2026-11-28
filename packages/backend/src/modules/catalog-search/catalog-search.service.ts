import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { StagedData } from '../../database/entities';
import { EmbeddingsService } from './embeddings.service';
import { SettingsService } from '../settings/settings.service';
import { ConnectionsService } from '../connections/connections.service';
import { SchemaService } from '../schema/schema.service';

const MAX_TABLES_PER_CONNECTION = 50;
const MAX_COLUMNS_PER_TABLE = 40;
const MAX_QUERY_LENGTH = 500;
const DEFAULT_SEARCH_LIMIT = 20;

export interface CatalogSearchResult {
  object_type: string;
  object_key: string;
  content: string;
  score: number;
}

interface CatalogDocument {
  objectType: string;
  objectKey: string;
  content: string;
}

@Injectable()
export class CatalogSearchService {
  private readonly logger = new Logger(CatalogSearchService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly settingsService: SettingsService,
    private readonly connectionsService: ConnectionsService,
    private readonly schemaService: SchemaService,
    @InjectRepository(StagedData)
    private readonly stagedDataRepository: Repository<StagedData>,
    private readonly dataSource: DataSource,
  ) {}

  async reindex(organizationId: string): Promise<{ indexed: number }> {
    const documents = await this.collectDocuments(organizationId);

    if (documents.length === 0) {
      return { indexed: 0 };
    }

    const settings = await this.settingsService.getOrganizationSettings(organizationId);
    const embeddings = await this.embeddingsService.embed(
      documents.map((doc) => doc.content),
      settings,
    );

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const vectorLiteral = this.embeddingsService.toVectorLiteral(embeddings[i]);
      await this.dataSource.query(
        `INSERT INTO catalog_embeddings ("id", "organization_id", "object_type", "object_key", "content", "embedding", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6::vector, now())
         ON CONFLICT ("organization_id", "object_type", "object_key")
         DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, updated_at = now()`,
        [uuidv4(), organizationId, doc.objectType, doc.objectKey, doc.content, vectorLiteral],
      );
    }

    return { indexed: documents.length };
  }

  async search(
    organizationId: string,
    query: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ): Promise<CatalogSearchResult[]> {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Search query must not be empty');
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(`Search query must be ${MAX_QUERY_LENGTH} characters or fewer`);
    }

    const settings = await this.settingsService.getOrganizationSettings(organizationId);
    const [embedding] = await this.embeddingsService.embed([query], settings);
    const vectorLiteral = this.embeddingsService.toVectorLiteral(embedding);

    return this.dataSource.query(
      `SELECT object_type, object_key, content, 1 - (embedding <=> $1::vector) AS score
       FROM catalog_embeddings
       WHERE organization_id = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [vectorLiteral, organizationId, limit],
    );
  }

  private async collectDocuments(organizationId: string): Promise<CatalogDocument[]> {
    const documents: CatalogDocument[] = [];

    const connections = await this.connectionsService.findAll(organizationId);
    for (const connection of connections) {
      try {
        const tables = (await this.schemaService.getTables(connection.id, organizationId)).slice(
          0,
          MAX_TABLES_PER_CONNECTION,
        );

        for (const table of tables) {
          const columns = (
            await this.schemaService.getColumns(connection.id, organizationId, table.name, table.schema)
          ).slice(0, MAX_COLUMNS_PER_TABLE);

          const columnsText = columns.map((col) => `${col.name} (${col.type})`).join(', ');

          documents.push({
            objectType: 'table',
            objectKey: `${connection.id}:${table.schema}.${table.name}`,
            content: `${connection.name} ${table.schema}.${table.name} — columns: ${columnsText}`,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Skipping connection ${connection.id} during catalog reindex: ${(error as Error).message}`,
        );
      }
    }

    const stagedDatasets = await this.stagedDataRepository.find({ where: { organizationId } });
    for (const staged of stagedDatasets) {
      const columnNames = Array.isArray(staged.schema)
        ? staged.schema.map((col: { name: string }) => col.name).join(', ')
        : '';

      documents.push({
        objectType: 'staged',
        objectKey: `staged:${staged.id}`,
        content: `${staged.tableName} — columns: ${columnNames}`,
      });
    }

    return documents;
  }
}
