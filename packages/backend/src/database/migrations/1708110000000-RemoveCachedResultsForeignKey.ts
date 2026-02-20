import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCachedResultsForeignKey1708110000000
  implements MigrationInterface
{
  name = 'RemoveCachedResultsForeignKey1708110000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the foreign key constraint on cached_results.queryId
    // This allows cached_results to be used for both queries and transformations
    await queryRunner.query(`
      ALTER TABLE cached_results
      DROP CONSTRAINT IF EXISTS "cached_results_queryId_fkey"
    `);

    // Ensure queryId column is nullable
    await queryRunner.query(`
      ALTER TABLE cached_results
      ALTER COLUMN "queryId" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the foreign key constraint
    await queryRunner.query(`
      ALTER TABLE cached_results
      ADD CONSTRAINT "cached_results_queryId_fkey"
      FOREIGN KEY ("queryId") REFERENCES query_history(id) ON DELETE CASCADE
    `);

    // Make queryId NOT NULL again (only if there are no NULL values)
    await queryRunner.query(`
      UPDATE cached_results SET "queryId" = id WHERE "queryId" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE cached_results
      ALTER COLUMN "queryId" SET NOT NULL
    `);
  }
}
