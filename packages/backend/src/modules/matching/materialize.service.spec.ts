import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MaterializeService } from './materialize.service';
import { SourceReaderService } from './sources/source-reader.service';
import { NormalizationService } from './normalization.service';
import type { MatchProject } from '../../database/entities';

describe('MaterializeService', () => {
  let service: MaterializeService;

  const dataSource = { query: jest.fn() };
  const reader = { readPage: jest.fn(), countRows: jest.fn() };

  const project: MatchProject = {
    id: 'p1',
    organizationId: 'org1',
    name: 'Citizens dedupe',
    description: null,
    mode: 'dedupe',
    leftSource: {
      kind: 'connection',
      connectionId: 'c1',
      schemaName: 'public',
      tableName: 'citizens',
      primaryKey: 'id',
    },
    rightSource: null,
    fieldMap: [
      { left: 'surname', right: 'surname', role: 'person_name', weight: 0.5, comparator: 'trgm' },
      { left: 'dob', right: 'dob', role: 'date', weight: 0.3, comparator: 'daydiff' },
    ],
    blockingPasses: [
      { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' },
    ],
    thresholds: { matchAt: 0.9, rejectAt: 0.55 },
    columnAllowlist: ['id', 'surname', 'dob'],
    lawfulBasis: 'consent',
    dataOwner: 'owner@example.com',
    retentionDays: 30,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as MatchProject;

  beforeEach(async () => {
    jest.clearAllMocks();
    dataSource.query.mockResolvedValue(undefined);
    reader.readPage
      .mockResolvedValueOnce({
        rows: [
          { id: 'k1', surname: 'MUKAMANA, Joséphine', dob: '1988-05-01' },
          { id: 'k2', surname: 'Alice Smith', dob: '1990-01-01' },
        ],
        lastKey: 'k2',
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'k3', surname: 'Bob Jones', dob: '1975-07-07' }],
        lastKey: 'k3',
      })
      .mockResolvedValueOnce({ rows: [], lastKey: null });

    const mod = await Test.createTestingModule({
      providers: [
        MaterializeService,
        NormalizationService,
        { provide: DataSource, useValue: dataSource },
        { provide: SourceReaderService, useValue: reader },
      ],
    }).compile();
    service = mod.get(MaterializeService);
  });

  it('names the workspace table from the project id with dashes replaced', () => {
    expect(service.workspaceTable('a1b2-c3d4', 'left')).toBe('matching.p_a1b2_c3d4_left');
  });

  it('creates one text column per mapped field and no others', async () => {
    await service.materialize(project, 'left', 'run1');
    const create = dataSource.query.mock.calls
      .map((c) => c[0] as string)
      .find((s) => s.includes('CREATE TABLE'))!;
    expect(create).toContain('"src_key" text PRIMARY KEY');
    expect(create).toContain('"surname" text');
    expect(create).toContain('"dob" text');
    expect(create).not.toContain('salary');
    // "and no others": "id" is on the allow-list and is the source's primary
    // key, so an implementation that emitted one column per columnAllowlist
    // entry would add `"id" text` here and still satisfy every assertion
    // above. The key is stored once, under the fixed name "src_key".
    expect(create).not.toContain('"id" text');
  });

  it('loops pages until an empty page and reports the total row count', async () => {
    const result = await service.materialize(project, 'left', 'run1');
    expect(result.rows).toBe(3);
    expect(reader.readPage).toHaveBeenCalledTimes(3);
  });

  it('passes the previous page last key as the next afterKey', async () => {
    // readPage(source, allowlist, projection, organizationId, afterKey, limit)
    // -- afterKey is argument 4 since Ruling R17 split allowlist from projection.
    await service.materialize(project, 'left', 'run1');
    expect(reader.readPage.mock.calls[0][4]).toBeNull();
    expect(reader.readPage.mock.calls[1][4]).toBe('k2');
  });

  it('writes normalized values, not raw ones', async () => {
    await service.materialize(project, 'left', 'run1');
    const insert = dataSource.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO matching.'))!;
    expect(insert[1]).toContain('josephine mukamana');
    expect(insert[1]).not.toContain('MUKAMANA, Joséphine');
  });

  it('declares the generated blocking key column in CREATE TABLE and indexes it after the load', async () => {
    await service.materialize(project, 'left', 'run1');
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    const create = sqls.find((s) => s.includes('CREATE TABLE'))!;

    // STORED is asserted explicitly, not just "GENERATED ALWAYS AS": a
    // generated column without a STORED (or VIRTUAL) keyword is a syntax
    // error PostgreSQL rejects outright, and nothing else in this suite
    // executes real SQL to catch that.
    expect(create).toMatch(/"bk_name_dob" text GENERATED ALWAYS AS \(.+\) STORED/);

    // Never ALTER TABLE ... ADD COLUMN after the load: adding a STORED
    // generated column to a populated table forces a full heap rewrite
    // under ACCESS EXCLUSIVE, once per pass, on a table just written.
    expect(sqls.some((s) => s.includes('ADD COLUMN'))).toBe(false);

    // The index, by contrast, genuinely belongs after the rows are in.
    const indexAt = sqls.findIndex((s) => s.includes('CREATE INDEX') && s.includes('bk_name_dob'));
    const lastInsertAt = sqls.reduce((acc, s, i) => (s.includes('INSERT INTO matching.') ? i : acc), -1);
    expect(indexAt).toBeGreaterThan(-1);
    expect(lastInsertAt).toBeGreaterThan(-1);
    expect(indexAt).toBeGreaterThan(lastInsertAt);
  });

  it('creates a GIN trigram index for a trigram pass', async () => {
    await service.materialize(
      {
        ...project,
        blockingPasses: [{ name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 }],
      } as any,
      'left',
      'run1',
    );
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('USING gin') && s.includes('gin_trgm_ops'))).toBe(true);
  });

  it('chunks one page\'s insert so no statement exceeds PostgreSQL\'s 65535 bound-parameter cap', async () => {
    // 65535 is PostgreSQL's wire-protocol hard limit on bound parameters per
    // statement -- not a tuning choice, so this is not a knob to raise.
    // rowWidth is src_key plus one parameter per mapped field; picking a row
    // count derived from that (rather than a hardcoded magic number) proves
    // the chunking scales with however wide the field map happens to be.
    const PG_MAX_BIND_PARAMS = 65535;
    const rowWidth = 1 + project.fieldMap.length;
    const rowCount = Math.floor(PG_MAX_BIND_PARAMS / rowWidth) + 50;

    reader.readPage.mockReset();
    reader.readPage
      .mockResolvedValueOnce({
        rows: Array.from({ length: rowCount }, (_, i) => ({
          id: `k${i}`,
          surname: `Person ${i}`,
          dob: '1990-01-01',
        })),
        lastKey: `k${rowCount - 1}`,
      })
      .mockResolvedValueOnce({ rows: [], lastKey: null });

    await service.materialize(project, 'left', 'run1');

    const insertCalls = dataSource.query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO matching.'));
    // A chunk size of one row per statement would also pass a bare
    // "more than one statement" check while being pathologically slow, so
    // the count check alone is not the point -- the per-statement
    // parameter-count check below is what actually pins the invariant.
    expect(insertCalls.length).toBeGreaterThan(1);
    for (const call of insertCalls) {
      const params = call[1] as unknown[];
      expect(params.length).toBeLessThanOrEqual(PG_MAX_BIND_PARAMS);
    }
  });
  // --- Allow-list enforcement (the legal boundary). The brief's
  // `expect(create).not.toContain('salary')` is vacuous on its own --
  // "salary" appears nowhere in the fixture, so no implementation could
  // have put it there. These are the tests that actually constrain what
  // citizen data is permitted to enter DataGate.

  it('refuses a mapped field column that is not on the allow-list', async () => {
    await expect(
      service.materialize(
        {
          ...project,
          fieldMap: [
            ...project.fieldMap,
            { left: 'salary', right: 'salary', role: 'text', weight: 0.2, comparator: 'exact' },
          ],
        } as any,
        'left',
        'run1',
      ),
    ).rejects.toThrow(BadRequestException);
    // Nothing is executed: the check runs before the workspace table is dropped.
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('refuses a primary key that is not on the allow-list, with no exception for the key', async () => {
    await expect(
      service.materialize(
        { ...project, leftSource: { ...(project.leftSource as any), primaryKey: 'national_id' } } as any,
        'left',
        'run1',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('hands the reader the project allow-list and a narrower projection', async () => {
    // Two arguments with two provenances (Ruling R17): the allow-list is
    // the project's legal boundary, the projection is the subset this run
    // actually needs. "phone" is allow-listed but unmapped, so it must
    // reach the reader's allow-list and stay out of its projection.
    await service.materialize(
      { ...project, columnAllowlist: ['id', 'surname', 'dob', 'phone'] } as any,
      'left',
      'run1',
    );
    const [, allowlist, projection] = reader.readPage.mock.calls[0];
    expect(allowlist).toEqual(['id', 'surname', 'dob', 'phone']);
    expect(projection).toEqual(['id', 'surname', 'dob']);
  });

  // --- Field-map integrity

  it('refuses a field map that maps one source column twice', async () => {
    // Two mappings on "surname" would emit CREATE TABLE (... "surname" text,
    // "surname" text), which PostgreSQL refuses -- and silently keeping one
    // would make the score depend on field-map ordering.
    await expect(
      service.materialize(
        {
          ...project,
          fieldMap: [
            ...project.fieldMap,
            { left: 'surname', right: 'surname', role: 'text', weight: 0.2, comparator: 'exact' },
          ],
        } as any,
        'left',
        'run1',
      ),
    ).rejects.toThrow(/surname/);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  // --- Index naming under PostgreSQL's 63-byte NAMEDATALEN limit.
  // PostgreSQL truncates an over-long identifier with a notice instead of
  // erroring, so this never fails loudly -- it fails the day two passes
  // truncate to the same 63 bytes and the second CREATE INDEX reports
  // "relation already exists", mid-materialize, after the table has been
  // dropped and reloaded.

  const uuidProject = {
    ...project,
    id: '3f2a1b4c-5d6e-4f70-8a91-2b3c4d5e6f70',
  } as unknown as MatchProject;

  it('keeps the index name within 63 bytes for a UUID project id and a realistic pass name', async () => {
    await service.materialize(
      {
        ...uuidProject,
        blockingPasses: [{ name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 }],
      } as any,
      'left',
      'run1',
    );
    const indexSql = dataSource.query.mock.calls.map((c) => String(c[0])).find((s) => s.includes('CREATE INDEX'))!;
    const indexName = /CREATE INDEX "([^"]+)"/.exec(indexSql)![1];
    // Composed from the full table segment this was 'p_' + 36 + '_left' +
    // '_bk_near_name_trgm_idx' = 65 bytes -- silently truncated.
    expect(Buffer.byteLength(indexName, 'utf8')).toBeLessThanOrEqual(63);
    expect(indexName).toContain('bk_near_name');
  });

  it('refuses a blocking pass whose index name would exceed 63 bytes', async () => {
    const longPass = 'a'.repeat(60);
    await expect(
      service.materialize(
        { ...uuidProject, blockingPasses: [{ name: longPass, kind: 'equi', keyExpr: 'surname' }] } as any,
        'left',
        'run1',
      ),
    ).rejects.toThrow(BadRequestException);
    // Rejected before the table is dropped, not half-way through a reload.
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  // --- Page size actually reaching the reader

  it('pages the reader at the documented MATCHING_BATCH_ROWS default of 50000', async () => {
    delete process.env.MATCHING_BATCH_ROWS;
    await service.materialize(project, 'left', 'run1');
    expect(reader.readPage.mock.calls[0][5]).toBe(50_000);
  });

  it('pages the reader at MATCHING_BATCH_ROWS when it is set', async () => {
    const previous = process.env.MATCHING_BATCH_ROWS;
    process.env.MATCHING_BATCH_ROWS = '1234';
    try {
      await service.materialize(project, 'left', 'run1');
      expect(reader.readPage.mock.calls[0][5]).toBe(1234);
    } finally {
      if (previous === undefined) delete process.env.MATCHING_BATCH_ROWS;
      else process.env.MATCHING_BATCH_ROWS = previous;
    }
  });
});
