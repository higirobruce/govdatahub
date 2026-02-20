import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDatasetSharing1708120000000 implements MigrationInterface {
  name = 'AddDatasetSharing1708120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create dataset_shares table
    await queryRunner.query(`
      CREATE TABLE dataset_shares (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        dataset_type TEXT NOT NULL CHECK (dataset_type IN ('staged', 'connection', 'transformation')),
        dataset_id TEXT NOT NULL,
        table_name TEXT,
        organization_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        access_level TEXT NOT NULL DEFAULT 'private' CHECK (access_level IN ('public', 'organization', 'private')),
        share_token TEXT UNIQUE,
        api_key TEXT UNIQUE,
        active BOOLEAN DEFAULT true,
        row_count INTEGER,
        schema TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed_at TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX idx_dataset_shares_org ON dataset_shares(organization_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_dataset_shares_type ON dataset_shares(dataset_type)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_dataset_shares_token ON dataset_shares(share_token)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_dataset_shares_api_key ON dataset_shares(api_key)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_dataset_shares_active ON dataset_shares(active)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_dataset_shares_access_level ON dataset_shares(access_level)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS dataset_shares CASCADE`);
  }
}
