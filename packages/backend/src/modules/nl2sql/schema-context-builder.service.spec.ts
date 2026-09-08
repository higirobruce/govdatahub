import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchemaContextBuilderService } from './schema-context-builder.service';
import { SchemaService } from '../schema/schema.service';
import { ConnectionsService } from '../connections/connections.service';
import { Connection } from '../../database/entities/connection.entity';

describe('SchemaContextBuilderService (COR-01)', () => {
  let service: SchemaContextBuilderService;
  const schemaService = {
    getSchemas: jest.fn(),
    getTables: jest.fn(),
    getColumns: jest.fn(),
  };
  const connectionRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const driver = {
    query: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  const connectionsService = {
    getDriver: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    driver.disconnect.mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        SchemaContextBuilderService,
        { provide: SchemaService, useValue: schemaService },
        { provide: ConnectionsService, useValue: connectionsService },
        { provide: getRepositoryToken(Connection), useValue: connectionRepository },
      ],
    }).compile();
    service = module.get(SchemaContextBuilderService);
  });

  it('passes organizationId (not the schema name) to getColumns and populates columns', async () => {
    connectionRepository.find.mockResolvedValue([
      { id: 'conn-1', name: 'main-db', type: 'postgresql', organizationId: 'org-1' },
    ]);
    schemaService.getTables.mockResolvedValue([
      { name: 'users', schema: 'public' },
    ] as any);
    schemaService.getColumns.mockResolvedValue([
      { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
      { name: 'email', type: 'text', nullable: false },
    ] as any);

    const ctx = await service.buildContext('org-1', undefined, {
      includeSampleData: false,
      maxTablesPerConnection: 20,
      maxColumnsPerTable: 50,
    });

    expect(schemaService.getColumns).toHaveBeenCalledWith(
      'conn-1',
      'org-1',
      'users',
      'public',
    );
    const table = ctx.connections[0].tables[0];
    expect(table.columns.length).toBeGreaterThan(0);
  });

  it('passes organizationId (not the schema name) to getColumns in buildSimplifiedContext', async () => {
    connectionRepository.findOne.mockResolvedValue({
      id: 'conn-1',
      name: 'main-db',
      type: 'postgresql',
      organizationId: 'org-1',
    });
    schemaService.getTables.mockResolvedValue([
      { name: 'orders', schema: 'public' },
    ] as any);
    schemaService.getColumns.mockResolvedValue([
      { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
    ] as any);

    const ctx = await service.buildSimplifiedContext('conn-1');

    expect(schemaService.getColumns).toHaveBeenCalledWith(
      'conn-1',
      'org-1',
      'orders',
      'public',
    );
    const table = ctx.connections[0].tables[0];
    expect(table.columns.length).toBeGreaterThan(0);
  });

  it('enriches postgresql connections with foreign-key relationships and sample rows', async () => {
    connectionRepository.find.mockResolvedValue([
      { id: 'conn-1', name: 'main-db', type: 'postgresql', organizationId: 'org-1' },
    ]);
    schemaService.getTables.mockResolvedValue([
      { name: 'orders', schema: 'public' },
    ] as any);
    schemaService.getColumns.mockResolvedValue([
      { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
      { name: 'customer_id', type: 'uuid', nullable: false },
    ] as any);

    connectionsService.getDriver.mockResolvedValue(driver);
    driver.query
      .mockResolvedValueOnce({
        rows: [
          {
            table_schema: 'public',
            table_name: 'orders',
            column_name: 'customer_id',
            foreign_table_schema: 'public',
            foreign_table_name: 'customers',
            foreign_column_name: 'id',
          },
        ],
        rowCount: 1,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'o1', customer_id: 'c1' }],
        rowCount: 1,
        fields: [],
      });

    const ctx = await service.buildContext('org-1', undefined, {
      includeSampleData: true,
      maxTablesPerConnection: 20,
      maxColumnsPerTable: 50,
    });

    const table = ctx.connections[0].tables[0];
    expect(table.relationships).toEqual([
      {
        type: 'many-to-one',
        sourceTable: 'orders',
        targetTable: 'customers',
        sourceColumn: 'customer_id',
        targetColumn: 'id',
      },
    ]);
    expect(table.sampleData).toEqual([{ id: 'o1', customer_id: 'c1' }]);
    expect(driver.disconnect).toHaveBeenCalled();
  });

  it('skips sample rows for a table with an invalid identifier but keeps relationships', async () => {
    connectionRepository.find.mockResolvedValue([
      { id: 'conn-1', name: 'main-db', type: 'postgresql', organizationId: 'org-1' },
    ]);
    schemaService.getTables.mockResolvedValue([
      { name: 'orders; drop table users', schema: 'public' },
    ] as any);
    schemaService.getColumns.mockResolvedValue([
      { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
    ] as any);

    connectionsService.getDriver.mockResolvedValue(driver);
    driver.query.mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] });

    const ctx = await service.buildContext('org-1', undefined, {
      includeSampleData: true,
      maxTablesPerConnection: 20,
      maxColumnsPerTable: 50,
    });

    const table = ctx.connections[0].tables[0];
    expect(table.sampleData).toBeUndefined();
    // Only the relationships query should have hit the driver; the sample query was skipped.
    expect(driver.query).toHaveBeenCalledTimes(1);
  });

  it('does not attempt enrichment for non-postgres/mysql connections', async () => {
    connectionRepository.find.mockResolvedValue([
      { id: 'conn-1', name: 'snowflake-db', type: 'snowflake', organizationId: 'org-1' },
    ]);
    schemaService.getTables.mockResolvedValue([{ name: 'orders', schema: 'public' }] as any);
    schemaService.getColumns.mockResolvedValue([
      { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
    ] as any);

    const ctx = await service.buildContext('org-1', undefined, {
      includeSampleData: true,
      maxTablesPerConnection: 20,
      maxColumnsPerTable: 50,
    });

    expect(connectionsService.getDriver).not.toHaveBeenCalled();
    expect(ctx.connections[0].tables[0].relationships).toBeUndefined();
  });
});
