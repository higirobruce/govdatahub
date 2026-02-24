import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataQuality1711000000003 implements MigrationInterface {
  name = 'AddDataQuality1711000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE table_profiles (
        id              TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        schema_name     TEXT NOT NULL,
        table_name      TEXT NOT NULL,
        row_count       BIGINT,
        column_profiles JSONB NOT NULL DEFAULT '[]',
        status          TEXT NOT NULL DEFAULT 'running',
        error_message   TEXT,
        duration_ms     INTEGER,
        profiled_at     TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_table_profiles_org      ON table_profiles(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_table_profiles_conn_tbl ON table_profiles(connection_id, schema_name, table_name)`);

    await queryRunner.query(`
      CREATE TABLE quality_checks (
        id              TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        connection_id   TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        schema_name     TEXT NOT NULL,
        table_name      TEXT NOT NULL,
        column_name     TEXT,
        name            TEXT NOT NULL,
        description     TEXT,
        check_type      TEXT NOT NULL,
        config          JSONB NOT NULL DEFAULT '{}',
        status          TEXT NOT NULL DEFAULT 'active',
        last_run_at     TIMESTAMP,
        last_run_status TEXT,
        last_run_value  DOUBLE PRECISION,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_quality_checks_org  ON quality_checks(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_quality_checks_conn ON quality_checks(connection_id)`);

    await queryRunner.query(`
      CREATE TABLE quality_check_runs (
        id              TEXT PRIMARY KEY,
        check_id        TEXT NOT NULL REFERENCES quality_checks(id) ON DELETE CASCADE,
        organization_id TEXT NOT NULL,
        status          TEXT NOT NULL,
        actual_value    DOUBLE PRECISION,
        expected_desc   TEXT,
        error_message   TEXT,
        duration_ms     INTEGER,
        ran_at          TIMESTAMP DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_qc_runs_check ON quality_check_runs(check_id)`);
    await queryRunner.query(`CREATE INDEX idx_qc_runs_org   ON quality_check_runs(organization_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS quality_check_runs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS quality_checks CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS table_profiles CASCADE`);
  }
}
