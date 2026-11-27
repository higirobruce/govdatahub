import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSavedQueries1711000000004 implements MigrationInterface {
  name = 'AddSavedQueries1711000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE saved_queries (
        id                  TEXT PRIMARY KEY,
        organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        connection_id       TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        created_by          TEXT NOT NULL,
        name                TEXT NOT NULL,
        description         TEXT,
        sql                 TEXT NOT NULL,
        parameters          JSONB NOT NULL DEFAULT '[]'::jsonb,
        cache_ttl_seconds   INTEGER NOT NULL DEFAULT 300,
        created_at          TIMESTAMP DEFAULT NOW(),
        updated_at          TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_saved_queries_organization ON saved_queries(organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_saved_queries_connection ON saved_queries(connection_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS saved_queries CASCADE`);
  }
}
