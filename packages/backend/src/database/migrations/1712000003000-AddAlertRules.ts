import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlertRules1712000003000 implements MigrationInterface {
  name = 'AddAlertRules1712000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "alert_rules" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "connection_id" TEXT NOT NULL,
        "sql" TEXT NOT NULL,
        "threshold_value" FLOAT NOT NULL,
        "threshold_operator" TEXT NOT NULL,
        "check_interval_minutes" INT NOT NULL DEFAULT 60,
        "notification_channels" JSONB NOT NULL DEFAULT '[]',
        "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
        "organization_id" TEXT NOT NULL,
        "created_by" TEXT,
        "last_triggered_at" TIMESTAMP,
        "last_checked_at" TIMESTAMP,
        "last_value" FLOAT,
        "last_status" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_alert_rules_org" ON "alert_rules" ("organization_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "alert_events" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "rule_id" TEXT NOT NULL,
        "value" FLOAT NOT NULL,
        "status" TEXT NOT NULL,
        "message" TEXT,
        "organization_id" TEXT NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_alert_events_rule" FOREIGN KEY ("rule_id") REFERENCES "alert_rules" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_alert_events_rule_id" ON "alert_events" ("rule_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "alert_events"`);
    await queryRunner.query(`DROP TABLE "alert_rules"`);
  }
}
