import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataIngestion1708500000000 implements MigrationInterface {
  name = 'AddDataIngestion1708500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create import_jobs table
    await queryRunner.query(`
      CREATE TABLE import_jobs (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        source_type TEXT NOT NULL CHECK (source_type IN ('csv', 'excel', 'json', 'parquet', 'api')),
        target_type TEXT NOT NULL CHECK (target_type IN ('staging', 'database')),
        target_table TEXT,
        connection_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        rows_processed INTEGER DEFAULT 0,
        rows_succeeded INTEGER DEFAULT 0,
        rows_failed INTEGER DEFAULT 0,
        errors JSONB,
        config JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL
      )
    `);

    // Create staged_data table
    await queryRunner.query(`
      CREATE TABLE staged_data (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        import_job_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        schema JSONB NOT NULL,
        data JSONB NOT NULL,
        row_count INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX idx_import_jobs_org ON import_jobs(organization_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_import_jobs_status ON import_jobs(status)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_import_jobs_created ON import_jobs(created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_staged_data_org_job ON staged_data(organization_id, import_job_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_staged_data_org_table ON staged_data(organization_id, table_name)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS staged_data CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS import_jobs CASCADE`);
  }
}
