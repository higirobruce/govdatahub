import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDashboards1711000000005 implements MigrationInterface {
  name = 'AddDashboards1711000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE dashboards (
        id              TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        created_by      TEXT NOT NULL,
        name            TEXT NOT NULL,
        description     TEXT,
        widgets         JSONB NOT NULL DEFAULT '[]'::jsonb,
        layout          JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_dashboards_organization ON dashboards(organization_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dashboards CASCADE`);
  }
}
