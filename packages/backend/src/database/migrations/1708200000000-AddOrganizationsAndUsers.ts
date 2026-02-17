import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationsAndUsers1708200000000 implements MigrationInterface {
  name = 'AddOrganizationsAndUsers1708200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create organizations table
    await queryRunner.query(`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subdomain TEXT NOT NULL UNIQUE,
        settings TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX idx_users_organization_id ON users(organization_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_users_email ON users(email)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_users_role ON users(role)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_organizations_subdomain ON organizations(subdomain)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_organizations_is_active ON organizations(is_active)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS organizations CASCADE`);
  }
}
