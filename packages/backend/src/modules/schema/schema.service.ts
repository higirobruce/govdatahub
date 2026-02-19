import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConnectionsService } from '../connections/connections.service';
import { SchemaInfo, TableInfo, ColumnInfo } from '../connections/drivers/database-driver.interface';

@Injectable()
export class SchemaService {
  constructor(
    private connectionsService: ConnectionsService,
    private dataSource: DataSource,
  ) {}

  async getSchemas(connectionId: string, organizationId: string): Promise<SchemaInfo[]> {
    const driver = await this.connectionsService.getDriver(connectionId, organizationId);

    try {
      return await driver.getSchemas();
    } finally {
      await driver.disconnect();
    }
  }

  async getTables(connectionId: string, organizationId: string, schema?: string): Promise<TableInfo[]> {
    const driver = await this.connectionsService.getDriver(connectionId, organizationId);

    try {
      return await driver.getTables(schema);
    } finally {
      await driver.disconnect();
    }
  }

  async getColumns(
    connectionId: string,
    organizationId: string,
    table: string,
    schema?: string,
  ): Promise<ColumnInfo[]> {
    const driver = await this.connectionsService.getDriver(connectionId, organizationId);

    try {
      return await driver.getColumns(table, schema);
    } finally {
      await driver.disconnect();
    }
  }

  async getStagingTables(organizationId: string): Promise<TableInfo[]> {
    const stagingSchema = `staging_${organizationId.replace(/-/g, '_')}`;

    const result = await this.dataSource.query(
      `SELECT
        table_name as "tableName",
        pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name)) as "sizeBytes"
      FROM information_schema.tables
      WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
      [stagingSchema]
    );

    return result.map((row: any) => ({
      name: row.tableName,
      schema: stagingSchema,
      rowCount: null, // Could add COUNT query if needed
      sizeBytes: parseInt(row.sizeBytes, 10),
    }));
  }

  async getStagingColumns(
    organizationId: string,
    table: string,
  ): Promise<ColumnInfo[]> {
    const stagingSchema = `staging_${organizationId.replace(/-/g, '_')}`;

    const result = await this.dataSource.query(
      `SELECT
        column_name as "columnName",
        data_type as "dataType",
        is_nullable as "isNullable",
        column_default as "columnDefault"
      FROM information_schema.columns
      WHERE table_schema = $1
      AND table_name = $2
      ORDER BY ordinal_position`,
      [stagingSchema, table]
    );

    return result.map((row: any) => ({
      name: row.columnName,
      type: row.dataType,
      nullable: row.isNullable === 'YES',
      defaultValue: row.columnDefault,
    }));
  }
}
