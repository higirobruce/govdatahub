import { Test } from '@nestjs/testing';
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
  });

  it('loops pages until an empty page and reports the total row count', async () => {
    const result = await service.materialize(project, 'left', 'run1');
    expect(result.rows).toBe(3);
    expect(reader.readPage).toHaveBeenCalledTimes(3);
  });

  it('passes the previous page last key as the next afterKey', async () => {
    await service.materialize(project, 'left', 'run1');
    expect(reader.readPage.mock.calls[0][3]).toBeNull();
    expect(reader.readPage.mock.calls[1][3]).toBe('k2');
  });

  it('writes normalized values, not raw ones', async () => {
    await service.materialize(project, 'left', 'run1');
    const insert = dataSource.query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO matching.'))!;
    expect(insert[1]).toContain('josephine mukamana');
    expect(insert[1]).not.toContain('MUKAMANA, Joséphine');
  });

  it('adds a generated blocking key column and an index for each pass', async () => {
    await service.materialize(project, 'left', 'run1');
    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('ADD COLUMN "bk_name_dob"') && s.includes('GENERATED ALWAYS AS'))).toBe(true);
    expect(sqls.some((s) => s.includes('CREATE INDEX') && s.includes('bk_name_dob'))).toBe(true);
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
});
