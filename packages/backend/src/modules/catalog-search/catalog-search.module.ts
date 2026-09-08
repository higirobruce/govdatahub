import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

/**
 * Catalog search module skeleton.
 * Task 3 adds the search service/controller that consumes catalog_embeddings.
 */
@Module({
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class CatalogSearchModule {}
