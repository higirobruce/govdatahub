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

  it('projects self-join pairs as n*(n-1)/2 summed per key, from a single server-side-aggregated query', async () => {
    // Ruling R22: the histogram is aggregated server-side into one summary
    // row -- total 5 rows (3+2), both keys under the max(50, 0.5%) = 50
    // floor, so both are kept and their pairs (3 and 1) are summed by
    // PostgreSQL itself, not by fetching one row per distinct key.
    dataSource.query.mockResolvedValue([
      { total_rows: '5', kept_pairs: '4', kept_key_count: '2', dropped_keys: [] },
    ]);
    const est = await service.estimate(project);
    expect(dataSource.query).toHaveBeenCalledTimes(1); // one query per pass (Ruling P8)
    expect(est.perPass[0].estimatedPairs).toBe(4);

    // The one statement actually sent must name the right table and the
    // right blocking column, and must aggregate rather than return one row
    // per key -- a wrong table, a wrong column or a missing GROUP BY would
    // all otherwise pass silently.
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('matching.p_p1_left');
    expect(sql).toContain('"bk_name_dob"');
    expect(sql).toMatch(/GROUP BY/i);
  });

  it('drops a key value above the degenerate threshold and excludes its pairs', async () => {
    // 10,003 rows total; the empty-surname key covers 200 of them (~2%)
    // and every one of the 98 filler keys at 100 rows each (~1%) also
    // clears max(50, 0.5% of 10,003 ~= 50.015) -- so all 99 are dropped.
    // Only MKMN|1988 (3 rows) stays under the cutoff. Ruling R22: this
    // summary is what PostgreSQL would return, not a per-key row set.
    const droppedFillers = Array.from({ length: 98 }, (_, i) => `K${i}`);
    dataSource.query.mockResolvedValue([
      {
        total_rows: '10003',
        kept_pairs: '3',
        kept_key_count: '1',
        dropped_keys: ['|1988', ...droppedFillers],
      },
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
      { total_rows: '400', kept_pairs: '190', kept_key_count: '1', dropped_keys: ['FILLER'] },
    ]);
    const est = await service.estimate(project);
    expect(est.perPass[0].droppedKeys).not.toContain('COMMON');
    expect(est.perPass[0].estimatedPairs).toBe(190);
  });

  it('flags exceedsCap above the configured cap and refused above twice it', async () => {
    process.env.MATCHING_MAX_CANDIDATE_PAIRS = '100';
    dataSource.query.mockResolvedValue([
      { total_rows: '30', kept_pairs: '435', kept_key_count: '1', dropped_keys: [] }, // 435 pairs
    ]);
    const est = await service.estimate(project);
    expect(est.totalEstimatedPairs).toBe(435);
    expect(est.exceedsCap).toBe(true);
    expect(est.refused).toBe(true);
  });

  it('reports exact:true and hasInexactPass:false for an equi-only project', async () => {
    dataSource.query.mockResolvedValue([
      { total_rows: '5', kept_pairs: '4', kept_key_count: '2', dropped_keys: [] },
    ]);
    const est = await service.estimate(project); // project's only pass is 'equi'
    expect(est.perPass[0].exact).toBe(true);
    expect(est.hasInexactPass).toBe(false);
  });

  it('reports exact:false for a trigram pass and sets hasInexactPass (Ruling R20)', async () => {
    // A trigram pass's histogram-derived count is a lower bound, not an
    // estimate: the histogram can only see exact-key matches, but the
    // pass's real join proposes every pair with similarity >= threshold, a
    // strict superset. On a near-unique key the histogram is almost all
    // singletons, so a naive estimate would read near zero while the real
    // join is quadratic -- exactly the failure this flag exists to surface.
    const trigramProject: MatchProject = {
      ...project,
      blockingPasses: [{ name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 }],
    } as unknown as MatchProject;
    dataSource.query.mockResolvedValue([
      { total_rows: '10', kept_pairs: '0', kept_key_count: '10', dropped_keys: [] },
    ]);
    const est = await service.estimate(trigramProject);
    expect(est.perPass[0].exact).toBe(false);
    expect(est.hasInexactPass).toBe(true);
  });

  it('builds a dedupe self-join guarded so each pair appears once, naming the table on both sides', () => {
    const sql = service.candidatePairsSql(
      project,
      { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' },
      [],
    );
    expect(sql).toContain('l."bk_name_dob" = r."bk_name_dob"');
    expect(sql).toContain('l."src_key" < r."src_key"');
    // A 'right'-side typo (wrong table, or the never-supported right-side
    // workspace) must not be able to pass: both aliases must reference the
    // exact same table.
    expect(sql).toContain('FROM matching.p_p1_left l');
    expect(sql).toContain('JOIN matching.p_p1_left r');
    // No dropped keys were passed -- NOT IN () is a SQL syntax error, not a
    // no-op, so its absence here is load-bearing, not incidental.
    expect(sql).not.toContain('NOT IN');
  });

  it('excludes dropped keys from the join as a bound parameter, never interpolated', () => {
    const sql = service.candidatePairsSql(
      project,
      { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' },
      ['|1988'],
    );
    expect(sql).toContain('NOT IN');
    expect(sql).toContain('$1');
    // The literal dropped value must never appear in the SQL text itself --
    // an implementation that interpolated it (e.g. NOT IN ('|1988')) would
    // satisfy a bare `toContain('NOT IN')` check while failing exactly the
    // defect this rule exists to catch.
    expect(sql).not.toContain('|1988');
  });

  it('makes a trigram pass sargable: % for the GIN index, similarity() as the exact recheck (Ruling R21)', () => {
    const sql = service.candidatePairsSql(
      project,
      { name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 },
      [],
    );
    expect(sql).toContain('similarity(');
    expect(sql).toContain('0.4');
    // similarity(l.col, r.col) alone cannot use the GIN gin_trgm_ops index
    // built on this column -- only %, <% and <-> do. Without % here the
    // planner falls back to a full self cross-product.
    expect(sql).toContain('l."bk_near_name" % r."bk_near_name"');
  });

  it('passSessionSettings returns the trigram session requirement as data, and nothing for equi (Ruling R21)', () => {
    expect(
      service.passSessionSettings({ name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 }),
    ).toEqual(['SET LOCAL pg_trgm.similarity_threshold = 0.4']);

    expect(
      service.passSessionSettings({ name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' }),
    ).toEqual([]);
  });
});
