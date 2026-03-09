import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationIdToExistingTables1708300000000 implements MigrationInterface {
  name = 'AddOrganizationIdToExistingTables1708300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension if not already enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create default organization if not exists
    await queryRunner.query(`
      INSERT INTO organizations (id, name, subdomain, is_active, created_at, updated_at)
      SELECT
        uuid_generate_v4()::text,
        'Default Organization',
        'default',
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE subdomain = 'default')
    `);

    // Get the default organization ID
    const defaultOrgResult = await queryRunner.query(`
      SELECT id FROM organizations WHERE subdomain = 'default' LIMIT 1
    `);
    const defaultOrgId = defaultOrgResult[0]?.id;

    if (!defaultOrgId) {
      throw new Error('Failed to create or find default organization');
    }

    // Helper: add organization_id column + FK + index to a table, skipping if already present
    const addOrgId = async (table: string, constraint: string, index: string) => {
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS organization_id TEXT`);
      await queryRunner.query(`UPDATE ${table} SET organization_id = '${defaultOrgId}' WHERE organization_id IS NULL`);
      await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN organization_id SET NOT NULL`);
      await queryRunner.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN
            ALTER TABLE ${table} ADD CONSTRAINT ${constraint}
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
          END IF;
        END $$
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS ${index} ON ${table}(organization_id)`);
    };

    await addOrgId('connections',        'fk_connections_organization',        'idx_connections_organization_id');
    await addOrgId('query_history',      'fk_query_history_organization',      'idx_query_history_organization_id');
    await addOrgId('cached_results',     'fk_cached_results_organization',     'idx_cached_results_organization_id');
    await addOrgId('transformations',    'fk_transformations_organization',    'idx_transformations_organization_id');
    await addOrgId('transformation_runs','fk_transformation_runs_organization','idx_transformation_runs_organization_id');

    // Composite indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_connections_org_name ON connections(organization_id, name)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_transformations_org_status ON transformations(organization_id, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_query_history_org_executed ON query_history(organization_id, executed_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_query_history_org_executed`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transformations_org_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_connections_org_name`);

    // Remove organization_id from transformation_runs
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transformation_runs_organization_id`);
    await queryRunner.query(`ALTER TABLE transformation_runs DROP CONSTRAINT IF EXISTS fk_transformation_runs_organization`);
    await queryRunner.query(`ALTER TABLE transformation_runs DROP COLUMN IF EXISTS organization_id`);

    // Remove organization_id from transformations
    await queryRunner.query(`DROP INDEX IF EXISTS idx_transformations_organization_id`);
    await queryRunner.query(`ALTER TABLE transformations DROP CONSTRAINT IF EXISTS fk_transformations_organization`);
    await queryRunner.query(`ALTER TABLE transformations DROP COLUMN IF EXISTS organization_id`);

    // Remove organization_id from cached_results
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cached_results_organization_id`);
    await queryRunner.query(`ALTER TABLE cached_results DROP CONSTRAINT IF EXISTS fk_cached_results_organization`);
    await queryRunner.query(`ALTER TABLE cached_results DROP COLUMN IF EXISTS organization_id`);

    // Remove organization_id from query_history
    await queryRunner.query(`DROP INDEX IF EXISTS idx_query_history_organization_id`);
    await queryRunner.query(`ALTER TABLE query_history DROP CONSTRAINT IF EXISTS fk_query_history_organization`);
    await queryRunner.query(`ALTER TABLE query_history DROP COLUMN IF EXISTS organization_id`);

    // Remove organization_id from connections
    await queryRunner.query(`DROP INDEX IF EXISTS idx_connections_organization_id`);
    await queryRunner.query(`ALTER TABLE connections DROP CONSTRAINT IF EXISTS fk_connections_organization`);
    await queryRunner.query(`ALTER TABLE connections DROP COLUMN IF EXISTS organization_id`);
  }
}
