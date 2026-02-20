import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class ExtendImportJobsForMultipleSources1708600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add URL to import source type enum
    await queryRunner.query(`
      ALTER TYPE import_source_type ADD VALUE IF NOT EXISTS 'url';
      ALTER TYPE import_source_type ADD VALUE IF NOT EXISTS 'database';
      ALTER TYPE import_source_type ADD VALUE IF NOT EXISTS 'ftp';
      ALTER TYPE import_source_type ADD VALUE IF NOT EXISTS 'sftp';
    `);

    // Add new columns to import_jobs table
    await queryRunner.addColumn(
      'import_jobs',
      new TableColumn({
        name: 'source_url',
        type: 'text',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'import_jobs',
      new TableColumn({
        name: 'source_connection_id',
        type: 'text',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'import_jobs',
      new TableColumn({
        name: 'source_table',
        type: 'text',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'import_jobs',
      new TableColumn({
        name: 'import_method',
        type: 'text',
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      'import_jobs',
      new TableColumn({
        name: 'source_config',
        type: 'jsonb',
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns
    await queryRunner.dropColumn('import_jobs', 'source_config');
    await queryRunner.dropColumn('import_jobs', 'import_method');
    await queryRunner.dropColumn('import_jobs', 'source_table');
    await queryRunner.dropColumn('import_jobs', 'source_connection_id');
    await queryRunner.dropColumn('import_jobs', 'source_url');

    // Note: Cannot remove enum values in PostgreSQL
    // They will remain but won't be used
  }
}
