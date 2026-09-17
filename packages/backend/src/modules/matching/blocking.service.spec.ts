import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BlockingService } from './blocking.service';
import { MaterializeService } from './materialize.service';
import type { MatchProject } from '../../database/entities';

describe('BlockingService', () => {
  let service: BlockingService;

  const dataSource = { query: jest.fn() };
  const materialize = {
    workspaceTable: jest.fn((projectId: string, side: 'left' | 'right') =>
      `matching.p_${projectId.replace(/-/g, '_')}_${side}`,
    ),
  };

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
    blockingPasses: [{ name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' }],
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
    delete process.env.MATCHING_MAX_CANDIDATE_PAIRS;

    const mod = await Test.createTestingModule({
      providers: [
        BlockingService,
        { provide: DataSource, useValue: dataSource },
        { provide: MaterializeService, useValue: materialize },
      ],
    }).compile();
    service = mod.get(BlockingService);
  });

  afterEach(() => {
    delete process.env.MATCHING_MAX_CANDIDATE_PAIRS;
  });

  it('projects self-join pairs as n*(n-1)/2 summed per key', async () => {
    dataSource.query.mockResolvedValue([
      { key: 'MKMN|1988', n: '3' }, // 3 pairs
      { key: 'NKRB|1990', n: '2' }, // 1 pair
    ]);
    const est = await service.estimate(project);
    expect(dataSource.query).toHaveBeenCalledTimes(1); // one query per pass (Ruling P8)
    expect(est.perPass[0].estimatedPairs).toBe(4);
  });

  it('drops a key value covering more than 0.5% of rows and excludes its pairs', async () => {
    // 10,003 rows total, all of it from this histogram; the empty-surname
    // key covers 200 of them (~2%), above the degenerate threshold --
    // and so, in fact, does every one of the 98 filler keys at 100 rows
    // each (~1%): both clear the absolute floor (Ruling R19, 50 rows) AND
    // the 0.5% share (~50 rows here), so they stay dropped under the
    // floored rule exactly as they were under the bare percentage. Only
    // MKMN|1988 (3 rows, ~0.03%, under both the floor and the share)
    // stays under the cutoff.
    const rest = Array.from({ length: 98 }, (_, i) => ({ key: `K${i}`, n: '100' }));
    dataSource.query.mockResolvedValue([
      { key: '|1988', n: '200' },
      { key: 'MKMN|1988', n: '3' },
      ...rest,
    ]);
    const est = await service.estimate(project);
    expect(est.perPass[0].droppedKeys).toContain('|1988');
    expect(est.perPass[0].estimatedPairs).toBe(3);
  });

  it('keeps a legitimately common key in a small table (Ruling R19 absolute floor)', async () => {
    // 400-row table; a surname shared by 20 people is ordinary data, not
    // degenerate. Under the bare 0.5% share (2 rows) it would have been
    // dropped, silently losing 190 real pairs. Ruling R19's floor (50 rows)
    // keeps any key at or under 50 rows regardless of share, so it survives
    // here. This fails against the pre-R19 implementation (commit
    // 7897e91), which drops 'COMMON' and yields 0 pairs instead of 190.
    dataSource.query.mockResolvedValue([
      { key: 'COMMON', n: '20' },
      { key: 'FILLER', n: '380' },
    ]);
    const est = await service.estimate(project);
    expect(est.perPass[0].droppedKeys).not.toContain('COMMON');
    expect(est.perPass[0].estimatedPairs).toBe(190);
  });

  it('flags exceedsCap above the configured cap and refused above twice it', async () => {
    process.env.MATCHING_MAX_CANDIDATE_PAIRS = '100';
    dataSource.query.mockResolvedValue([{ key: 'k', n: '30' }]); // 435 pairs
    const est = await service.estimate(project);
    expect(est.totalEstimatedPairs).toBe(435);
    expect(est.exceedsCap).toBe(true);
    expect(est.refused).toBe(true);
  });

  it('builds a dedupe self-join guarded so each pair appears once', () => {
    const sql = service.candidatePairsSql(
      project,
      { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' },
      [],
    );
    expect(sql).toContain('l."bk_name_dob" = r."bk_name_dob"');
    expect(sql).toContain('l."src_key" < r."src_key"');
  });

  it('excludes dropped keys from the join', () => {
    const sql = service.candidatePairsSql(
      project,
      { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' },
      ['|1988'],
    );
    expect(sql).toContain('NOT IN');
  });

  it('uses a similarity threshold for a trigram pass', () => {
    const sql = service.candidatePairsSql(
      project,
      { name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 },
      [],
    );
    expect(sql).toContain('similarity(');
    expect(sql).toContain('0.4');
  });
});
