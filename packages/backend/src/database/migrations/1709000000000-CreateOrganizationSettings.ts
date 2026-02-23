import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateOrganizationSettings1709000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'organization_settings',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'organization_id',
            type: 'uuid',
            isNullable: false,
          },
          // AI Provider Configuration
          {
            name: 'ai_provider',
            type: 'varchar',
            length: '50',
            default: "'openai'",
          },
          {
            name: 'ai_model',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'ai_api_key',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ai_api_endpoint',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ai_temperature',
            type: 'decimal',
            precision: 3,
            scale: 2,
            default: 0.1,
          },
          {
            name: 'ai_max_tokens',
            type: 'integer',
            default: 2000,
          },
          // NL2SQL Settings
          {
            name: 'nl2sql_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'nl2sql_include_schema_context',
            type: 'boolean',
            default: true,
          },
          {
            name: 'nl2sql_max_query_length',
            type: 'integer',
            default: 1000,
          },
          {
            name: 'nl2sql_auto_execute',
            type: 'boolean',
            default: false,
          },
          {
            name: 'nl2sql_show_reasoning',
            type: 'boolean',
            default: true,
          },
          // Safety Settings
          {
            name: 'sql_validation_enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'allowed_sql_operations',
            type: 'text',
            isArray: true,
            default: "'{SELECT}'",
          },
          {
            name: 'max_rows_limit',
            type: 'integer',
            default: 10000,
          },
          // General Settings
          {
            name: 'query_timeout_seconds',
            type: 'integer',
            default: 30,
          },
          {
            name: 'enable_query_history',
            type: 'boolean',
            default: true,
          },
          {
            name: 'enable_query_sharing',
            type: 'boolean',
            default: true,
          },
          // Audit
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'updated_by',
            type: 'uuid',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Create index on organization_id
    await queryRunner.createIndex(
      'organization_settings',
      new TableIndex({
        name: 'idx_org_settings_org',
        columnNames: ['organization_id'],
      })
    );

    // Create unique constraint on organization_id
    await queryRunner.query(
      'ALTER TABLE organization_settings ADD CONSTRAINT uq_org_settings_org UNIQUE (organization_id)'
    );

    // Create foreign key to organizations table
    await queryRunner.createForeignKey(
      'organization_settings',
      new TableForeignKey({
        columnNames: ['organization_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'organizations',
        onDelete: 'CASCADE',
      })
    );

    // Create foreign keys for audit fields
    await queryRunner.createForeignKey(
      'organization_settings',
      new TableForeignKey({
        columnNames: ['created_by'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      })
    );

    await queryRunner.createForeignKey(
      'organization_settings',
      new TableForeignKey({
        columnNames: ['updated_by'],
        referencedColumnNames: ['id'],
        referencedTableName: ['users'],
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('organization_settings');
  }
}
