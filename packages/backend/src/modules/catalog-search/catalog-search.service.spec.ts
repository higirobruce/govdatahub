import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CatalogSearchService } from './catalog-search.service';
import { EmbeddingsService } from './embeddings.service';
import { SettingsService } from '../settings/settings.service';
import { ConnectionsService } from '../connections/connections.service';
import { SchemaService } from '../schema/schema.service';
import { StagedData } from '../../database/entities';

describe('CatalogSearchService', () => {
  let service: CatalogSearchService;

  const embeddingsService = {
    embed: jest.fn(),
    toVectorLiteral: jest.fn(),
  };
  const settingsService = {
    getOrganizationSettings: jest.fn(),
  };
  const connectionsService = {
    findAll: jest.fn(),
  };
  const schemaService = {
    getTables: jest.fn(),
    getColumns: jest.fn(),
  };
  const stagedDataRepository = {
    find: jest.fn(),
  };
  const dataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CatalogSearchService,
        { provide: EmbeddingsService, useValue: embeddingsService },
        { provide: SettingsService, useValue: settingsService },
        { provide: ConnectionsService, useValue: connectionsService },
        { provide: SchemaService, useValue: schemaService },
        { provide: getRepositoryToken(StagedData), useValue: stagedDataRepository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(CatalogSearchService);
  });

  describe('search', () => {
    it('embeds the query and runs a cosine-distance vector search scoped to the org', async () => {
      settingsService.getOrganizationSettings.mockResolvedValue({ aiApiEndpoint: 'http://gpu:11434' });
      embeddingsService.embed.mockResolvedValue([[0.1, 0.2]]);
      embeddingsService.toVectorLiteral.mockReturnValue('[0.1,0.2]');
      const mockedRows = [
        { object_type: 'table', object_key: 'conn-1:public.facilities', content: 'main-db public.facilities', score: 0.92 },
      ];
      dataSource.query.mockResolvedValue(mockedRows);

      const result = await service.search('org-1', 'health facilities');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('embedding <=>'),
        [expect.stringMatching(/^\[.*\]$/), 'org-1', 20],
      );
      expect(result).toEqual(mockedRows);
    });

    it('rejects empty queries', async () => {
      await expect(service.search('org-1', '')).rejects.toThrow();
    });

    it('rejects queries longer than 500 characters', async () => {
      await expect(service.search('org-1', 'x'.repeat(501))).rejects.toThrow();
    });
  });

  describe('reindex', () => {
    it('embeds one document per table and one per staged dataset, upserting each via ON CONFLICT', async () => {
      settingsService.getOrganizationSettings.mockResolvedValue({ aiApiEndpoint: 'http://gpu:11434' });
      connectionsService.findAll.mockResolvedValue([
        { id: 'conn-1', name: 'main-db', type: 'postgresql' },
      ]);
      schemaService.getTables.mockResolvedValue([
        { name: 'facilities', schema: 'public', type: 'table' },
      ]);
      schemaService.getColumns.mockResolvedValue([
        { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
        { name: 'name', type: 'text', nullable: false, isPrimaryKey: false },
      ]);
      stagedDataRepository.find.mockResolvedValue([
        {
          id: 'staged-1',
          tableName: 'imported_health',
          schema: [
            { name: 'col_a', type: 'text', sample: null },
            { name: 'col_b', type: 'text', sample: null },
          ],
        },
      ]);
      embeddingsService.embed.mockResolvedValue([[0.1], [0.2]]);
      embeddingsService.toVectorLiteral.mockImplementation((v: number[]) => `[${v.join(',')}]`);
      dataSource.query.mockResolvedValue([]);

      const result = await service.reindex('org-1');

      expect(result).toEqual({ indexed: 2 });
      expect(embeddingsService.embed).toHaveBeenCalledTimes(1);
      expect(embeddingsService.embed.mock.calls[0][0]).toHaveLength(2);
      expect(dataSource.query).toHaveBeenCalledTimes(2);
      for (const call of dataSource.query.mock.calls) {
        expect(call[0]).toContain('ON CONFLICT');
      }
    });

    it('warn-logs and skips a connection whose schema lookup fails, continuing with others', async () => {
      connectionsService.findAll.mockResolvedValue([
        { id: 'conn-bad', name: 'broken-db', type: 'postgresql' },
      ]);
      schemaService.getTables.mockRejectedValue(new Error('connection refused'));
      stagedDataRepository.find.mockResolvedValue([]);
      settingsService.getOrganizationSettings.mockResolvedValue({ aiApiEndpoint: 'http://gpu:11434' });
      embeddingsService.embed.mockResolvedValue([]);

      const result = await service.reindex('org-1');

      expect(result).toEqual({ indexed: 0 });
    });
  });
});
