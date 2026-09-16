import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEntityMatching1711000000010 implements MigrationInterface {
  name = 'AddEntityMatching1711000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS fuzzystrmatch`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS matching`);

    await queryRunner.query(`
      CREATE TABLE "match_projects" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "name" text NOT NULL,
        "description" text NULL,
        "mode" text NOT NULL,
        "left_source" jsonb NOT NULL,
        "right_source" jsonb NULL,
        "field_map" jsonb NOT NULL DEFAULT '[]',
        "blocking_passes" jsonb NOT NULL DEFAULT '[]',
        "thresholds" jsonb NOT NULL DEFAULT '{"matchAt":0.9,"rejectAt":0.55}',
        "column_allowlist" text[] NOT NULL DEFAULT '{}',
        "lawful_basis" text NOT NULL,
        "data_owner" text NOT NULL,
        "retention_days" integer NOT NULL DEFAULT 30,
        "status" text NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_projects_org" ON "match_projects" ("organization_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE "match_runs" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "status" text NOT NULL,
        "counters" jsonb NOT NULL DEFAULT '{}',
        "watermarks" jsonb NOT NULL DEFAULT '{}',
        "dropped_keys" jsonb NOT NULL DEFAULT '[]',
        "started_at" timestamptz NOT NULL DEFAULT now(),
        "finished_at" timestamptz NULL,
        "duration_ms" integer NULL,
        "error_message" text NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_runs_project" ON "match_runs" ("organization_id", "project_id", "started_at")`);

    await queryRunner.query(`
      CREATE TABLE "match_entities" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "run_id" text NOT NULL,
        "entity_key" text NOT NULL,
        "members" jsonb NOT NULL DEFAULT '[]',
        "golden" jsonb NOT NULL DEFAULT '{}',
        "size" integer NOT NULL,
        "flagged" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_entities_run" ON "match_entities" ("organization_id", "run_id", "flagged")`);
    await queryRunner.query(
      `CREATE INDEX "idx_match_entities_key" ON "match_entities" ("organization_id", "project_id", "entity_key")`);

    await queryRunner.query(`
      CREATE TABLE "match_decisions" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "left_source_ref" text NOT NULL,
        "left_key" text NOT NULL,
        "right_source_ref" text NOT NULL,
        "right_key" text NOT NULL,
        "decision" text NOT NULL,
        "user_id" text NULL,
        "prior_score" double precision NULL,
        "prior_llm_verdict" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_match_decisions_pair" UNIQUE
          ("organization_id", "project_id", "left_source_ref", "left_key", "right_source_ref", "right_key")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "match_candidates" (
        "id" bigserial PRIMARY KEY,
        "organization_id" text NOT NULL,
        "run_id" text NOT NULL,
        "left_key" text NOT NULL,
        "right_key" text NOT NULL,
        "blocking_pass" text NOT NULL,
        "features" jsonb NOT NULL DEFAULT '{}',
        "score" double precision NOT NULL,
        "decision" text NOT NULL,
        "llm_verdict" jsonb NULL,
        "reviewed_by" text NULL,
        "reviewed_at" timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_candidates_queue" ON "match_candidates" ("run_id", "decision", "score" DESC)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_match_candidates_pair" ON "match_candidates" ("run_id", "left_key", "right_key")`);

    await queryRunner.query(`
      CREATE TABLE "match_crosswalk" (
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "source_ref" text NOT NULL,
        "source_key" text NOT NULL,
        "entity_key" text NOT NULL,
        "confidence" double precision NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_match_crosswalk" PRIMARY KEY
          ("organization_id", "project_id", "source_ref", "source_key")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_match_crosswalk_entity" ON "match_crosswalk" ("organization_id", "project_id", "entity_key")`);

    await queryRunner.query(`
      CREATE TABLE "match_gold_pairs" (
        "id" text PRIMARY KEY,
        "organization_id" text NOT NULL,
        "project_id" text NOT NULL,
        "left_key" text NOT NULL,
        "right_key" text NOT NULL,
        "is_match" boolean NOT NULL,
        "labelled_by" text NULL,
        "labelled_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_match_gold_pair" UNIQUE ("organization_id", "project_id", "left_key", "right_key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "match_gold_pairs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_crosswalk"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_candidates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_decisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_entities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "match_projects"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS matching CASCADE`);
  }
}
