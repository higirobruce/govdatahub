import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiInteractions1711000000009 implements MigrationInterface {
  name = 'AddAiInteractions1711000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_interactions" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "user_id" text NULL,
        "feature" text NOT NULL,
        "model" text NULL,
        "prompt_chars" integer NOT NULL,
        "response_chars" integer NOT NULL,
        "latency_ms" integer NOT NULL,
        "success" boolean NOT NULL,
        "error_message" text NULL,
        "generated_sql" text NULL,
        "executed" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_ai_interactions_org_created" ON "ai_interactions" ("organization_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_interactions"`);
  }
}
