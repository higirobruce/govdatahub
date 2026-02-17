import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransformations1708100000000 implements MigrationInterface {
  name = 'AddTransformations1708100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create transformations table
    await queryRunner.query(`
      CREATE TABLE transformations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        source_connection_id TEXT NOT NULL,
        sql_query TEXT NOT NULL,
        output_config TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_run_at TIMESTAMP,
        FOREIGN KEY (source_connection_id) REFERENCES connections(id) ON DELETE CASCADE
      )
    `);

    // Create transformation_runs table
    await queryRunner.query(`
      CREATE TABLE transformation_runs (
        id TEXT PRIMARY KEY,
        transformation_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        execution_time_ms INTEGER,
        rows_processed INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        FOREIGN KEY (transformation_id) REFERENCES transformations(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX idx_transformations_status ON transformations(status)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_transformations_source_conn ON transformations(source_connection_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_transformation_runs_transformation_id
      ON transformation_runs(transformation_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_transformation_runs_started_at
      ON transformation_runs(started_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_transformation_runs_status
      ON transformation_runs(status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS transformation_runs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS transformations CASCADE`);
  }
}
