import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiConfig1708700000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_configs (
        id               TEXT        NOT NULL,
        organization_id  TEXT        NOT NULL UNIQUE,
        provider         TEXT        NOT NULL DEFAULT 'anthropic',
        encrypted_api_key TEXT,
        model            TEXT,
        ollama_url       TEXT,
        ollama_model     TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ai_configs PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_configs_org ON ai_configs (organization_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_configs`);
  }
}
