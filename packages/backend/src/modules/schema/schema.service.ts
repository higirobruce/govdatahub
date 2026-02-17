import { Injectable } from '@nestjs/common';
import { ConnectionsService } from '../connections/connections.service';
import { SchemaInfo, TableInfo, ColumnInfo } from '../connections/drivers/database-driver.interface';

@Injectable()
export class SchemaService {
  constructor(private connectionsService: ConnectionsService) {}

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
}
