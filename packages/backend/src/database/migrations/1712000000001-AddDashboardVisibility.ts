import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDashboardVisibility1712000000001 implements MigrationInterface {
  name = 'AddDashboardVisibility1712000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "saved_dashboards" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'org'`);
    await queryRunner.query(`ALTER TABLE "saved_dashboards" ADD COLUMN IF NOT EXISTS "created_by" TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "saved_dashboards" DROP COLUMN IF EXISTS "created_by"`);
    await queryRunner.query(`ALTER TABLE "saved_dashboards" DROP COLUMN IF EXISTS "visibility"`);
  }
}
