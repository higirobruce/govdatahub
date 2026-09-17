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
    await service.readPage(source, ['id', 'surname', 'dob'], ['id', 'surname', 'dob'], 'org1', null, 100);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('"id"');
    expect(sql).toContain('"surname"');
    expect(sql).toContain('"dob"');
    expect(sql).not.toContain('salary');
  });

  it('pages by keyset rather than offset', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', 'abc', 100);
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
    const page = await service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100);
    expect(page.lastKey).toBe('k2');
  });

  it('returns a null last key for an empty page', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    const page = await service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100);
    expect(page.lastKey).toBeNull();
  });

  it('refuses to read a column that is not on the allow-list', async () => {
    await expect(
      service.readPage({ ...source, primaryKey: 'salary' }, ['surname'], ['surname'], 'org1', null, 100),
    ).rejects.toThrow(BadRequestException);
  });

  it('reads a staged source from its JSONB rows', async () => {
    stagedRepo.findOne.mockResolvedValue({
      id: 's1', organizationId: 'org1',
      schema: [{ name: 'id', type: 'text' }, { name: 'surname', type: 'text' }],
      data: [{ id: 'k1', surname: 'a' }, { id: 'k2', surname: 'b' }],
    });
    const page = await service.readPage(
      { kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id', 'surname'], ['id', 'surname'], 'org1', 'k1', 100);
    expect(page.rows).toEqual([{ id: 'k2', surname: 'b' }]);
    expect(page.lastKey).toBe('k2');
  });

  // --- Supplementary coverage beyond the brief's verbatim tests ---
  // These target the three properties downstream tasks assume hold, per the
  // task's self-review checklist, plus the second public method (`countRows`)
  // which the brief's Step 1 tests never exercise.

  it('binds afterKey as a query parameter rather than interpolating it into the SQL text', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', 'secret-key-value', 100);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('secret-key-value');
    expect(params).toEqual(['secret-key-value']);
  });

  it('omits the WHERE clause entirely on the first page (afterKey null)', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/WHERE/i);
    expect(params).toEqual([]);
  });

  it('never selects the primary key twice when it is already in the allow-list', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100);
    const sql = query.mock.calls[0][0] as string;
    const selectClause = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM'));
    expect(selectClause.match(/"id"/g)).toHaveLength(1);
  });

  it('scopes the staged lookup by organizationId', async () => {
    stagedRepo.findOne.mockResolvedValue(null);
    await expect(
      service.readPage({ kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id'], ['id'], 'org1', null, 100),
    ).rejects.toThrow();
    expect(stagedRepo.findOne).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: 'org1' },
    });
  });

  it('counts rows for a connection source via COUNT(*), scoped to its table', async () => {
    query.mockResolvedValue({ rows: [{ _count: '42' }], rowCount: 1, fields: [] });
    const count = await service.countRows(source, ['id', 'surname'], ['id', 'surname'], 'org1');
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
    const count = await service.countRows({ kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id'], ['id'], 'org1');
    expect(count).toBe(3);
    expect(stagedRepo.findOne).toHaveBeenCalledWith({
      where: { id: 's1', organizationId: 'org1' },
    });
  });

  it('refuses countRows when the primary key is not on the allow-list', async () => {
    await expect(
      service.countRows({ ...source, primaryKey: 'salary' }, ['surname'], ['surname'], 'org1'),
    ).rejects.toThrow(BadRequestException);
  });

  // --- Fail-closed guard for connection types that cannot page this
  // reader (Ruling R11, corrected). Four dialects, not three: snowflake,
  // bigquery and clickhouse because their driver cannot bind query
  // parameters (the bound value is silently dropped rather than erroring),
  // and mongodb because it is not a SQL engine at all — its driver
  // JSON.parse()s the "sql" argument. Both were missed in the original
  // pass; mongodb was found only in review.

  it.each(['snowflake', 'bigquery', 'clickhouse', 'mongodb'])(
    'readPage refuses a %s connection because it cannot page this reader',
    async (dbType) => {
      connections.getConnectionConfig.mockResolvedValue({ connection: { type: dbType } });
      await expect(
        service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('countRows refuses a snowflake connection because its driver cannot bind query parameters', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'snowflake' } });
    await expect(
      service.countRows(source, ['id', 'surname'], ['id', 'surname'], 'org1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('countRows refuses a mongodb connection because it is not a SQL engine', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'mongodb' } });
    await expect(
      service.countRows(source, ['id', 'surname'], ['id', 'surname'], 'org1'),
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
      service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100),
    ).resolves.toEqual({ rows: [], lastKey: null });
  });

  // --- limit validation (Important 2). `limit` is interpolated directly
  // into the SQL string (there is no bind position for LIMIT's row count),
  // so it must be rejected before it ever reaches SQL text, the same way
  // assertColumnAllowed and assertPageableDialect reject before building SQL.

  it('rejects a non-integer limit', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    await expect(
      service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 12.5),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a negative limit', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    await expect(
      service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, -1),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a zero limit', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    await expect(
      service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 0),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a limit above the maximum page size', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    await expect(
      service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100_001),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts a limit exactly at the maximum page size', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await expect(
      service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 100_000),
    ).resolves.toEqual({ rows: [], lastKey: null });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('LIMIT 100000');
  });

  // Regression: the design spec fixes MATCHING_BATCH_ROWS (the batch size
  // Task 6's materializer pages readPage at) to 50,000 in three places
  // (the literal materializer read, the narrative, and the §13 config
  // table). An earlier round of this task set MAX_PAGE_LIMIT to 10,000 by
  // analogy to an unrelated constant and never checked it against this
  // one — this test is what would have caught that, and what stops the
  // two numbers drifting apart again.
  it('accepts the documented MATCHING_BATCH_ROWS default of 50000, which the materializer will pass', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await expect(
      service.readPage(source, ['id', 'surname'], ['id', 'surname'], 'org1', null, 50_000),
    ).resolves.toEqual({ rows: [], lastKey: null });
  });

  it('rejects a non-integer limit for a staged source too', async () => {
    stagedRepo.findOne.mockResolvedValue({
      id: 's1', organizationId: 'org1',
      schema: [{ name: 'id', type: 'text' }],
      data: [{ id: 'k1' }],
    });
    await expect(
      service.readPage({ kind: 'staged', stagedDataId: 's1', primaryKey: 'id' }, ['id'], ['id'], 'org1', null, 12.5),
    ).rejects.toThrow(BadRequestException);
  });

  // --- allow-list vs projection (Ruling R17). These are two arguments
  // because they have two different provenances: the allow-list is the
  // project's legal boundary, the projection is what this read wants.
  // An earlier round passed the projection in as the allow-list, which
  // made the reader's re-validation `assertColumnAllowed(x, [x])` — a
  // check that cannot fail. These three tests are what make it fail.

  it('refuses a projection column that is not on the allow-list', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    await expect(
      service.readPage(source, ['id', 'surname'], ['id', 'salary'], 'org1', null, 100),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a projection column that is not on the allow-list for countRows too', async () => {
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    await expect(
      service.countRows(source, ['id', 'surname'], ['id', 'salary'], 'org1'),
    ).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('selects the projection, not every allow-listed column', async () => {
    // "dob" is allow-listed but not projected: the reader is permitted to
    // read it and still must not, because minimising what physically
    // leaves the source is the point of the projection.
    connections.getConnectionConfig.mockResolvedValue({ connection: { type: 'postgres' } });
    query.mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
    await service.readPage(source, ['id', 'surname', 'dob'], ['id', 'surname'], 'org1', null, 100);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('"surname"');
    expect(sql).not.toContain('"dob"');
  });
});
