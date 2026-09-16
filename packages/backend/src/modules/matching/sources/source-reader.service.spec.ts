import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SourceReaderService } from './source-reader.service';
import { ConnectionsService } from '../../connections/connections.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StagedData } from '../../../database/entities';

describe('SourceReaderService', () => {
  let service: SourceReaderService;
  const query = jest.fn();
  const connections = {
    getDriver: jest.fn().mockResolvedValue({ query }),
    getConnectionConfig: jest.fn().mockResolvedValue({ connection: { type: 'postgres' } }),
  };
  const stagedRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        SourceReaderService,
        { provide: ConnectionsService, useValue: connections },
        { provide: getRepositoryToken(StagedData), useValue: stagedRepo },
      ],
    }).compile();
    service = mod.get(SourceReaderService);
  });

  const source = {
    kind: 'connection' as const,
    connectionId: 'c1', schemaName: 'public', tableName: 'citizens', primaryKey: 'id',
  };

  it('selects only the primary key and allow-listed columns', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname', 'dob'], 'org1', null, 100);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('"id"');
    expect(sql).toContain('"surname"');
    expect(sql).toContain('"dob"');
    expect(sql).not.toContain('salary');
  });

  it('pages by keyset rather than offset', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], 'org1', 'abc', 100);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/WHERE "id" > /);
    expect(sql).toContain('ORDER BY "id"');
    expect(sql).toContain('LIMIT 100');
    expect(sql).not.toMatch(/OFFSET/i);
  });

  it('reports the last key of the page so the caller can continue', async () => {
    query.mockResolvedValue({
      rows: [{ id: 'k1', surname: 'a' }, { id: 'k2', surname: 'b' }], rowCount: 2, fields: [],
    });
    const page = await service.readPage(source, ['id', 'surname'], 'org1', null, 100);
    expect(page.lastKey).toBe('k2');
  });

  it('returns a null last key for an empty page', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    const page = await service.readPage(source, ['id', 'surname'], 'org1', null, 100);
    expect(page.lastKey).toBeNull();
  });

  it('refuses to read a column that is not on the allow-list', async () => {
    await expect(
      service.readPage({ ...source, primaryKey: 'salary' }, ['surname'], 'org1', null, 100),
    ).rejects.toThrow(BadRequestException);
  });

  it('reads a staged source from its JSONB rows', async () => {
    stagedRepo.findOne.mockResolvedValue({
      id: 's1', organizationId: 'org1',
      schema: [{ name: 'id', type: 'text' }, { name: 'surname', type: 'text' }],
      data: [{ id: 'k1', surname: 'a' }, { id: 'k2', surname: 'b' }],
    });
    const page = await service.readPage(
      { kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id', 'surname'], 'org1', 'k1', 100);
    expect(page.rows).toEqual([{ id: 'k2', surname: 'b' }]);
    expect(page.lastKey).toBe('k2');
  });

  // --- Supplementary coverage beyond the brief's verbatim tests ---
  // These target the three properties downstream tasks assume hold, per the
  // task's self-review checklist, plus the second public method (`countRows`)
  // which the brief's Step 1 tests never exercise.

  it('binds afterKey as a query parameter rather than interpolating it into the SQL text', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], 'org1', 'secret-key-value', 100);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('secret-key-value');
    expect(params).toEqual(['secret-key-value']);
  });

  it('omits the WHERE clause entirely on the first page (afterKey null)', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], 'org1', null, 100);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/WHERE/i);
    expect(params).toEqual([]);
  });

  it('never selects the primary key twice when it is already in the allow-list', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], 'org1', null, 100);
    const sql = query.mock.calls[0][0] as string;
    const selectClause = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM'));
    expect(selectClause.match(/"id"/g)).toHaveLength(1);
  });

  it('scopes the staged lookup by organizationId', async () => {
    stagedRepo.findOne.mockResolvedValue(null);
    await expect(
      service.readPage({ kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id'], 'org1', null, 100),
    ).rejects.toThrow();
    expect(stagedRepo.findOne).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: 'org1' },
    });
  });

  it('counts rows for a connection source via COUNT(*), scoped to its table', async () => {
    query.mockResolvedValue({ rows: [{ _count: '42' }], rowCount: 1, fields: [] });
    const count = await service.countRows(source, ['id', 'surname'], 'org1');
    expect(count).toBe(42);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('COUNT(*)');
    expect(sql).toContain('"public"."citizens"');
  });

  it('counts rows for a staged source as the length of its data array, scoped to organizationId', async () => {
    stagedRepo.findOne.mockResolvedValue({
      id: 's1', organizationId: 'org1',
      schema: [{ name: 'id', type: 'text' }],
      data: [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }],
    });
    const count = await service.countRows({ kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id'], 'org1');
    expect(count).toBe(3);
    expect(stagedRepo.findOne).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: 'org1' },
    });
  });

  it('refuses countRows when the primary key is not on the allow-list', async () => {
    await expect(
      service.countRows({ ...source, primaryKey: 'salary' }, ['surname'], 'org1'),
    ).rejects.toThrow(BadRequestException);
  });

  // --- Fail-closed guard for connection types whose driver cannot bind
  // query parameters (Ruling R11). Keyset pagination requires afterKey to
  // be bound, not interpolated; on these three drivers the bound value is
  // silently dropped rather than erroring, so the reader must refuse them
  // itself rather than risk a confusing engine error or wrong results.

  it.each(['snowflake', 'bigquery', 'clickhouse'])(
    'readPage refuses a %s connection because its driver cannot bind query parameters',
    async (dbType) => {
      connections.getConnectionConfig.mockResolvedValue({ connection: { type: dbType } });
      await expect(
        service.readPage(source, ['id', 'surname'], 'org1', null, 100),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('countRows refuses a snowflake connection because its driver cannot bind query parameters', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'snowflake' } });
    await expect(
      service.countRows(source, ['id', 'surname'], 'org1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('still pages a postgres connection (the guard is not over-broad)', async () => {
    // Explicit, not relying on the describe-level default: getConnectionConfig
    // is a shared mock whose mockResolvedValue from an earlier test in this
    // file otherwise bleeds forward (jest.clearAllMocks() clears call history,
    // not a previously set resolved value).
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await expect(
      service.readPage(source, ['id', 'surname'], 'org1', null, 100),
    ).resolves.toEqual({ rows: [], lastKey: null });
  });
});
