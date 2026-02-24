import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropStagedDataImportJobFk1711000000001 implements MigrationInterface {
  name = 'DropStagedDataImportJobFk1711000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the FK constraint so staged_data.import_job_id can hold any string —
    // including pipeline step IDs that are not in the import_jobs table.
    await queryRunner.query(
      `ALTER TABLE "staged_data" DROP CONSTRAINT IF EXISTS "staged_data_import_job_id_fkey"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the FK (note: this will fail if orphaned rows exist)
    await queryRunner.query(
      `ALTER TABLE "staged_data" ADD CONSTRAINT "staged_data_import_job_id_fkey"
       FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE`,
    );
  }
}
