import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserInvites1712100000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_invites (
        id          TEXT PRIMARY KEY,
        token       TEXT NOT NULL UNIQUE,
        email       TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'viewer',
        invited_by  TEXT NOT NULL,
        expires_at  TIMESTAMP NOT NULL,
        accepted_at TIMESTAMP,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_user_invites_token ON user_invites(token)`);
    await queryRunner.query(`CREATE INDEX idx_user_invites_org   ON user_invites(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_user_invites_email ON user_invites(email)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_invites`);
  }
}
