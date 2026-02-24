import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCatalogConfig1711000000002 implements MigrationInterface {
  name = 'AddCatalogConfig1711000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization_settings" ADD COLUMN IF NOT EXISTS "catalog_config" JSONB NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "catalog_config"`,
    );
  }
}
