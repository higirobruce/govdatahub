import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1708000000000 implements MigrationInterface {
  name = 'InitialSchema1708000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create connections table
    await queryRunner.query(`
      CREATE TABLE connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create query_history table
    await queryRunner.query(`
      CREATE TABLE query_history (
        id TEXT PRIMARY KEY,
        "connectionId" TEXT,
        "sqlQuery" TEXT NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "executionTimeMs" INTEGER,
        "rowCount" INTEGER,
        status TEXT NOT NULL,
        "errorMessage" TEXT,
        FOREIGN KEY ("connectionId") REFERENCES connections(id) ON DELETE CASCADE
      )
    `);

    // Create cached_results table
    await queryRunner.query(`
      CREATE TABLE cached_results (
        id TEXT PRIMARY KEY,
        "queryId" TEXT,
        results TEXT NOT NULL,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("queryId") REFERENCES query_history(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX idx_query_history_connection_id ON query_history("connectionId")
    `);

    await queryRunner.query(`
      CREATE INDEX idx_query_history_executed_at ON query_history(executed_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_cached_results_query_id ON cached_results("queryId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS cached_results CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS query_history CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS connections CASCADE`);
  }
}
