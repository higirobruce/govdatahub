import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotebooks1710000000000 implements MigrationInterface {
  name = 'AddNotebooks1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notebooks (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        organization_id TEXT NOT NULL,
        created_by      TEXT NOT NULL,
        cells           JSONB NOT NULL DEFAULT '[]',
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_notebooks_org ON notebooks(organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_notebooks_updated ON notebooks(updated_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notebooks CASCADE`);
  }
}
