import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalogEmbeddings1711000000008 implements MigrationInterface {
  name = 'AddCatalogEmbeddings1711000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`
      CREATE TABLE "catalog_embeddings" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "object_type" text NOT NULL,
        "object_key" text NOT NULL,
        "content" text NOT NULL,
        "embedding" vector(1024) NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_catalog_embeddings_org_obj" UNIQUE ("organization_id", "object_type", "object_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_catalog_embeddings_org" ON "catalog_embeddings" ("organization_id")`,
    );

    // Prefer ivfflat (per the design brief). Fall back to hnsw if ivfflat creation
    // fails on this Postgres build, and finally to no vector index at all (search
    // still works via a full scan, just slower) so the migration never blocks.
    try {
      await queryRunner.query(
        `CREATE INDEX "idx_catalog_embeddings_vec" ON "catalog_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)`,
      );
    } catch (ivfflatError) {
      try {
        await queryRunner.query(
          `CREATE INDEX "idx_catalog_embeddings_vec" ON "catalog_embeddings" USING hnsw ("embedding" vector_cosine_ops)`,
        );
      } catch (hnswError) {
        // eslint-disable-next-line no-console
        console.warn(
          'AddCatalogEmbeddings1711000000008: could not create a vector index (ivfflat or hnsw). ' +
            'catalog_embeddings was created WITHOUT a vector index; similarity search will fall back ' +
            'to a full table scan until an index is added manually.',
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "catalog_embeddings"`);
  }
}
