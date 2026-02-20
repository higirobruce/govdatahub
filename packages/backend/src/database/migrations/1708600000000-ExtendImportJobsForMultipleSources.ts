import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendImportJobsForMultipleSources1708600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns to import_jobs table
    await queryRunner.query(`
      ALTER TABLE import_jobs
      ADD COLUMN source_url TEXT,
      ADD COLUMN source_connection_id TEXT,
      ADD COLUMN source_table TEXT,
      ADD COLUMN import_method TEXT,
      ADD COLUMN source_config JSONB
    `);

    // Drop old CHECK constraint on source_type
    await queryRunner.query(`
      ALTER TABLE import_jobs
      DROP CONSTRAINT IF EXISTS import_jobs_source_type_check
    `);

    // Add new CHECK constraint with additional source types
    await queryRunner.query(`
      ALTER TABLE import_jobs
      ADD CONSTRAINT import_jobs_source_type_check
      CHECK (source_type IN ('csv', 'excel', 'json', 'parquet', 'api', 'url', 'database', 'ftp', 'sftp'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove new columns
    await queryRunner.query(`
      ALTER TABLE import_jobs
      DROP COLUMN IF EXISTS source_config,
      DROP COLUMN IF EXISTS import_method,
      DROP COLUMN IF EXISTS source_table,
      DROP COLUMN IF EXISTS source_connection_id,
      DROP COLUMN IF EXISTS source_url
    `);

    // Restore original CHECK constraint
    await queryRunner.query(`
      ALTER TABLE import_jobs
      DROP CONSTRAINT IF EXISTS import_jobs_source_type_check
    `);

    await queryRunner.query(`
      ALTER TABLE import_jobs
      ADD CONSTRAINT import_jobs_source_type_check
      CHECK (source_type IN ('csv', 'excel', 'json', 'parquet', 'api'))
    `);
  }
}
