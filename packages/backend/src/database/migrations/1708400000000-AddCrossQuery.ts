import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCrossQuery1708400000000 implements MigrationInterface {
  name = 'AddCrossQuery1708400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Install postgres_fdw extension (requires superuser; skip gracefully if already exists or no permission)
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgres_fdw`);
    } catch (e: any) {
      if (!e.message?.includes('permission denied')) throw e;
      // Extension must be created by a superuser outside this migration
    }

    // Create fdw_servers table
    await queryRunner.query(`
      CREATE TABLE fdw_servers (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        server_name TEXT NOT NULL UNIQUE,
        fdw_type TEXT NOT NULL CHECK (fdw_type IN ('postgres_fdw', 'mysql_fdw')),
        organization_id TEXT NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);

    // Create saved_cross_queries table
    await queryRunner.query(`
      CREATE TABLE saved_cross_queries (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        query_definition JSONB NOT NULL,
        generated_sql TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX idx_fdw_servers_connection ON fdw_servers(connection_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_fdw_servers_org ON fdw_servers(organization_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_fdw_servers_name ON fdw_servers(server_name)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_saved_cross_queries_org ON saved_cross_queries(organization_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_saved_cross_queries_user ON saved_cross_queries(created_by)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS saved_cross_queries CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS fdw_servers CASCADE`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS postgres_fdw CASCADE`);
  }
}
