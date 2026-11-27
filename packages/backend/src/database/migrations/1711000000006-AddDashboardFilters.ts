import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDashboardFilters1711000000006 implements MigrationInterface {
  name = 'AddDashboardFilters1711000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE dashboards ADD COLUMN filters JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE dashboards DROP COLUMN filters`);
  }
}
