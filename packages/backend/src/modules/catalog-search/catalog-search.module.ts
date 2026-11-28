import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmbeddingsService } from './embeddings.service';
import { CatalogSearchService } from './catalog-search.service';
import { CatalogSearchController } from './catalog-search.controller';
import { StagedData } from '../../database/entities';
import { SettingsModule } from '../settings/settings.module';
import { ConnectionsModule } from '../connections/connections.module';
import { SchemaModule } from '../schema/schema.module';

/**
 * Catalog search module.
 * Reindexes tables/staged datasets into catalog_embeddings and exposes
 * a semantic search endpoint over them.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StagedData]),
    SettingsModule,
    ConnectionsModule,
    SchemaModule,
  ],
  controllers: [CatalogSearchController],
  providers: [EmbeddingsService, CatalogSearchService],
  exports: [EmbeddingsService],
})
export class CatalogSearchModule {}
