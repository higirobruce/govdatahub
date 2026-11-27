import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SavedQueriesService } from './saved-queries.service';
import { QueryTemplateService } from './query-template.service';
import { CreateSavedQueryDto } from './dto/saved-query.dto';

type AnyMock = jest.Mock<any, any>;

interface Mocks {
  repo: { find: AnyMock; findOne: AnyMock; create: AnyMock; save: AnyMock; remove: AnyMock };
  historyRepo: { create: AnyMock; save: AnyMock };
  driver: { query: AnyMock; disconnect: AnyMock };
  connections: { getDriver: AnyMock };
  config: { get: AnyMock };
}

function buildSubject() {
  const mocks: Mocks = {
    repo: {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    historyRepo: {
      create: jest.fn((d) => d),
      save: jest.fn().mockResolvedValue(undefined),
    },
    driver: {
      query: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    },
    connections: {
      getDriver: jest.fn(),
    },
    config: {
      get: jest.fn((_name: string, def: unknown) => def),
    },
  };
  mocks.connections.getDriver.mockResolvedValue(mocks.driver);

  const template = new QueryTemplateService();
  const svc = new SavedQueriesService(
    mocks.repo as never,
    mocks.historyRepo as never,
    template,
    mocks.connections as never,
    mocks.config as never,
  );
  return { svc, mocks };
}

const ORG = 'org-1';
const USER = 'user-1';

describe('SavedQueriesService', () => {
  describe('create', () => {
    it('accepts a valid query and persists it', async () => {
      const { svc, mocks } = buildSubject();
      const dto: CreateSavedQueryDto = {
        name: 'Active users',
        connectionId: '11111111-1111-1111-1111-111111111111',
        sql: 'SELECT * FROM users WHERE created_at > {{since}}',
        parameters: [{ name: 'since', type: 'date', required: true }],
      };

      const saved = await svc.create(dto, ORG, USER);

      expect(saved.organizationId).toBe(ORG);
      expect(saved.createdBy).toBe(USER);
      expect(saved.parameters).toEqual([
        { name: 'since', type: 'date', required: true },
      ]);
      expect(saved.cacheTtlSeconds).toBe(300);
      expect(mocks.repo.save).toHaveBeenCalled();
    });

    it('rejects duplicate parameter names', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'bad',
            connectionId: '11111111-1111-1111-1111-111111111111',
            sql: 'SELECT 1',
            parameters: [
              { name: 'a', type: 'string', required: true },
              { name: 'a', type: 'number', required: true },
            ],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/Duplicate parameter/);
    });

    it('rejects invalid parameter name (starts with digit)', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'bad',
            connectionId: '11111111-1111-1111-1111-111111111111',
            sql: 'SELECT 1',
            parameters: [{ name: '1abc', type: 'string', required: true }],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/Invalid parameter name/);
    });

    it('rejects a default that does not match the declared type', async () => {
      const { svc } = buildSubject();
      await expect(
        svc.create(
          {
            name: 'bad-default',
            connectionId: '11111111-1111-1111-1111-111111111111',
            sql: 'SELECT {{n}}',
            parameters: [
              { name: 'n', type: 'number', required: false, default: 'oops' },
            ],
          },
          ORG,
          USER,
        ),
      ).rejects.toThrow(/default expected finite number/);
    });

    it('accepts an explicit null default', async () => {
      const { svc } = buildSubject();
      const saved = await svc.create(
        {
          name: 'nullable',
          connectionId: '11111111-1111-1111-1111-111111111111',
          sql: 'SELECT {{x}}',
          parameters: [
            { name: 'x', type: 'string', required: false, default: null },
          ],
        },
        ORG,
        USER,
      );
      expect(saved.parameters[0].default).toBeNull();
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when missing', async () => {
      const { svc, mocks } = buildSubject();
      mocks.repo.findOne.mockResolvedValue(null);
      await expect(svc.getById('missing', ORG)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the query when found', async () => {
      const { svc, mocks } = buildSubject();
      const sq = { id: 'q1', organizationId: ORG } as never;
      mocks.repo.findOne.mockResolvedValue(sq);
      await expect(svc.getById('q1', ORG)).resolves.toBe(sq);
    });
  });

  describe('execute', () => {
    function savedQueryFixture() {
      return {
        id: 'q1',
        organizationId: ORG,
        connectionId: 'c1',
        createdBy: USER,
        name: 'demo',
        description: null,
        sql: 'SELECT * FROM users WHERE created_at > {{since}}',
        parameters: [{ name: 'since', type: 'date', required: true }],
        cacheTtlSeconds: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    it('renders SQL and calls driver.query with bindings', async () => {
      const { svc, mocks } = buildSubject();
      mocks.repo.findOne.mockResolvedValue(savedQueryFixture());
      mocks.driver.query.mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
        fields: [{ name: 'id' }],
      });

      const result = await svc.execute('q1', { since: '2026-01-01' }, ORG);

      expect(mocks.driver.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE created_at > $1',
        ['2026-01-01'],
      );
      expect(result.status).toBe('success');
      expect(result.rowCount).toBe(1);
      expect(mocks.driver.disconnect).toHaveBeenCalled();
    });

    it('logs a success row to query history', async () => {
      const { svc, mocks } = buildSubject();
      mocks.repo.findOne.mockResolvedValue(savedQueryFixture());
      mocks.driver.query.mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      await svc.execute('q1', { since: '2026-01-01' }, ORG);

      expect(mocks.historyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          organizationId: ORG,
          sqlQuery: 'SELECT * FROM users WHERE created_at > $1',
        }),
      );
    });

    it('rejects bad parameter input with 400', async () => {
      const { svc, mocks } = buildSubject();
      mocks.repo.findOne.mockResolvedValue(savedQueryFixture());

      await expect(
        svc.execute('q1', { since: 12345 }, ORG),
      ).rejects.toThrow(BadRequestException);
      // Driver must not be called when validation fails.
      expect(mocks.driver.query).not.toHaveBeenCalled();
    });

    it('rejects missing required parameter', async () => {
      const { svc, mocks } = buildSubject();
      mocks.repo.findOne.mockResolvedValue(savedQueryFixture());

      await expect(svc.execute('q1', {}, ORG)).rejects.toThrow(
        /Missing required parameter/,
      );
    });

    it('logs failures, then re-throws as 400, and still disconnects', async () => {
      const { svc, mocks } = buildSubject();
      mocks.repo.findOne.mockResolvedValue(savedQueryFixture());
      mocks.driver.query.mockRejectedValue(new Error('connection lost'));

      await expect(
        svc.execute('q1', { since: '2026-01-01' }, ORG),
      ).rejects.toThrow(BadRequestException);

      expect(mocks.historyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' }),
      );
      expect(mocks.driver.disconnect).toHaveBeenCalled();
    });

    it('caps result rows at MAX_RESULT_ROWS', async () => {
      const { svc, mocks } = buildSubject();
      mocks.repo.findOne.mockResolvedValue(savedQueryFixture());
      mocks.config.get.mockImplementation((name: string, def: unknown) =>
        name === 'MAX_RESULT_ROWS' ? 2 : def,
      );
      // Rebuild with the patched config — easier than re-injecting.
      const tmpSvc = new SavedQueriesService(
        mocks.repo as never,
        mocks.historyRepo as never,
        new QueryTemplateService(),
        mocks.connections as never,
        mocks.config as never,
      );
      mocks.driver.query.mockResolvedValue({
        rows: [{ a: 1 }, { a: 2 }, { a: 3 }],
        rowCount: 3,
        fields: [{ name: 'a' }],
      });

      const result = await tmpSvc.execute(
        'q1',
        { since: '2026-01-01' },
        ORG,
      );
      expect(result.rows).toHaveLength(2);
    });
  });

  describe('remove', () => {
    it('removes after a successful fetch', async () => {
      const { svc, mocks } = buildSubject();
      const sq = { id: 'q1', organizationId: ORG } as never;
      mocks.repo.findOne.mockResolvedValue(sq);
      await svc.remove('q1', ORG);
      expect(mocks.repo.remove).toHaveBeenCalledWith(sq);
    });
  });
});
