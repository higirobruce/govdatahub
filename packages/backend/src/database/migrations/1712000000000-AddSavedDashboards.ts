import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSavedDashboards1712000000000 implements MigrationInterface {
  name = 'AddSavedDashboards1712000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE saved_dashboards (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        widgets         JSONB NOT NULL DEFAULT '[]',
        layout          JSONB NOT NULL DEFAULT '[]',
        organization_id TEXT NOT NULL,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_saved_dashboards_org ON saved_dashboards(organization_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS saved_dashboards CASCADE`);
  }
}
