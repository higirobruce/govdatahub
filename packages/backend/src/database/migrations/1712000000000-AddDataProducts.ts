import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDataProducts1712000000000 implements MigrationInterface {
  name = 'AddDataProducts1712000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE data_products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        version TEXT NOT NULL DEFAULT '1.0.0',
        descriptor JSONB,
        organization_id TEXT NOT NULL,
        owned_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE TABLE data_product_ports (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        name TEXT NOT NULL,
        port_type TEXT NOT NULL DEFAULT 'outputport',
        technology TEXT NOT NULL DEFAULT 'sql',
        connection_id TEXT,
        transformation_id TEXT,
        schema JSONB,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES data_products(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_data_products_org ON data_products(organization_id)`);
    await queryRunner.query(`CREATE INDEX idx_data_products_status ON data_products(status)`);
    await queryRunner.query(`CREATE INDEX idx_data_products_domain ON data_products(domain)`);
    await queryRunner.query(`CREATE INDEX idx_data_product_ports_product ON data_product_ports(product_id)`);
    await queryRunner.query(`CREATE INDEX idx_data_product_ports_connection ON data_product_ports(connection_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS data_product_ports CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS data_products CASCADE`);
  }
}
