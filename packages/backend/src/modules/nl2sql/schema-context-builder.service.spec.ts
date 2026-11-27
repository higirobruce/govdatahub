import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SchemaContextBuilderService } from './schema-context-builder.service';
import { SchemaService } from '../schema/schema.service';
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

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SchemaContextBuilderService,
        { provide: SchemaService, useValue: schemaService },
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
});
