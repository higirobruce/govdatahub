import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPipelines1711000000000 implements MigrationInterface {
  name = 'AddPipelines1711000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE pipelines (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        organization_id TEXT NOT NULL,
        created_by      TEXT NOT NULL,
        schedule        TEXT,
        status          TEXT NOT NULL DEFAULT 'active',
        stop_on_error   BOOLEAN NOT NULL DEFAULT TRUE,
        definition      JSONB NOT NULL DEFAULT '{"steps":[],"edges":[]}',
        last_run_at     TIMESTAMP,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE pipeline_runs (
        id               TEXT PRIMARY KEY,
        pipeline_id      TEXT NOT NULL,
        organization_id  TEXT NOT NULL,
        trigger_type     TEXT NOT NULL,
        status           TEXT NOT NULL DEFAULT 'running',
        step_results     JSONB NOT NULL DEFAULT '{}',
        started_at       TIMESTAMP DEFAULT NOW(),
        completed_at     TIMESTAMP,
        execution_time_ms INTEGER,
        error_message    TEXT,
        FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_pipelines_org ON pipelines(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_pipelines_updated ON pipelines(updated_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id)`);
    await queryRunner.query(`CREATE INDEX idx_pipeline_runs_org ON pipeline_runs(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_pipeline_runs_started ON pipeline_runs(started_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pipeline_runs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS pipelines CASCADE`);
  }
}
