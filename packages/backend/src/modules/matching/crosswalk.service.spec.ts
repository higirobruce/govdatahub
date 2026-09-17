import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CrosswalkService } from './crosswalk.service';
import { MatchEntity } from '../../database/entities';
import type { MatchProject, MatchRun } from '../../database/entities';

/**
 * `CrosswalkService` reads this run's clusters off `MatchEntity` (via the
 * repository, not raw SQL) and writes `match_crosswalk` with one
 * parameterized, multi-row `INSERT ... ON CONFLICT DO UPDATE` per chunk.
 * `dataSource.query` is mocked wholesale, so these tests read the
 * generated SQL text for the upsert shape but cannot verify it executes --
 * see the task report for the by-hand PostgreSQL read of every statement.
 */
describe('CrosswalkService', () => {
  let service: CrosswalkService;

  const dataSource = { query: jest.fn() };
  const entityRepo = { find: jest.fn() };

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
    fieldMap: [{ left: 'surname', right: 'surname', role: 'person_name', weight: 1, comparator: 'trgm' }],
    blockingPasses: [{ name: 'name', kind: 'equi', keyExpr: 'surname' }],
    thresholds: { matchAt: 0.9, rejectAt: 0.55 },
    columnAllowlist: ['id', 'surname'],
    lawfulBasis: 'consent',
    dataOwner: 'owner@example.com',
    retentionDays: 30,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as MatchProject;

  const stagedProject: MatchProject = {
    ...project,
    leftSource: { kind: 'staged', stagedDataId: 's1', primaryKey: 'id' },
  } as unknown as MatchProject;

  const run: MatchRun = {
    id: 'run1',
    organizationId: 'org1',
    projectId: 'p1',
    status: 'clustering',
    counters: {},
    watermarks: {},
    droppedKeys: [],
    startedAt: new Date(),
    finishedAt: null,
    durationMs: null,
    errorMessage: null,
  } as unknown as MatchRun;

  beforeEach(async () => {
    jest.clearAllMocks();
    dataSource.query.mockResolvedValue(undefined);
    entityRepo.find.mockResolvedValue([
      { entityKey: 'E1', flagged: false, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
    ]);

    const mod = await Test.createTestingModule({
      providers: [
        CrosswalkService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(MatchEntity), useValue: entityRepo },
      ],
    }).compile();
    service = mod.get(CrosswalkService);
  });

  it('builds a stable source ref for a connection source', () => {
    expect(
      service.sourceRef({
        kind: 'connection',
        connectionId: 'c1',
        schemaName: 'public',
        tableName: 'citizens',
        primaryKey: 'id',
      }),
    ).toBe('connection:c1:public.citizens');
  });

  it('builds a stable source ref for a staged source', () => {
    expect(service.sourceRef({ kind: 'staged', stagedDataId: 's1', primaryKey: 'id' })).toBe('staged:s1');
  });

  it('writes one crosswalk row per cluster member', async () => {
    entityRepo.find.mockResolvedValue([
      { entityKey: 'E1', flagged: false, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
    ]);
    const out = await service.publish(project, run);
    expect(out.written).toBe(2);
  });

  it('never writes a flagged cluster to the crosswalk', async () => {
    entityRepo.find.mockResolvedValue([
      { entityKey: 'E1', flagged: true, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
    ]);
    const out = await service.publish(project, run);
    expect(out.written).toBe(0);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('upserts so a re-run updates rather than duplicating', async () => {
    await service.publish(project, run);
    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toContain('ON CONFLICT ("organization_id", "project_id", "source_ref", "source_key")');
    expect(sql).toContain('DO UPDATE SET');
  });

  it('writes confidence as NULL rather than a fabricated value (Ruling R27)', async () => {
    entityRepo.find.mockResolvedValue([
      { entityKey: 'E1', flagged: false, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
    ]);
    await service.publish(project, run);
    const sql = String(dataSource.query.mock.calls[0][0]);
    const params = dataSource.query.mock.calls[0][1] as unknown[];
    expect(sql).toContain('$6::double precision');
    // Six bound params per row (org, project, source_ref, source_key,
    // entity_key, confidence); the sixth slot in each group of six is
    // confidence, and phase 1 must never write it as anything but NULL --
    // see the doc comment on `upsertChunk` for why a constant was rejected.
    expect(params[5]).toBeNull();
    expect(params[11]).toBeNull();
  });

  it('never publishes a non-null confidence anywhere in phase 1, across multiple clusters and chunk boundaries', async () => {
    const bigMembers = Array.from({ length: 50 }, (_, i) => ({ sourceKey: `k${i}` }));
    entityRepo.find.mockResolvedValue([
      { entityKey: 'A', flagged: false, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
      { entityKey: 'BIG', flagged: false, size: bigMembers.length, members: bigMembers },
    ]);

    await service.publish(project, run);

    expect(dataSource.query.mock.calls.length).toBeGreaterThan(0);
    for (const call of dataSource.query.mock.calls) {
      const params = call[1] as unknown[];
      // Confidence sits at position 5 within every group of 6 bound
      // params. If a future change reinstates a plausible-looking
      // constant (`1`, `0.9`, ...) here, this assertion is what catches
      // it -- not just that *a* row exists, but that *every* row's
      // confidence slot, in every statement, is still NULL.
      for (let i = 5; i < params.length; i += 6) {
        expect(params[i]).toBeNull();
      }
    }
  });

  it('scopes the read to this run and organization, never regenerating entity_key', async () => {
    entityRepo.find.mockResolvedValue([
      { entityKey: 'stable-key', flagged: false, size: 2, members: [{ sourceKey: 'a' }, { sourceKey: 'b' }] },
    ]);
    await service.publish(project, run);
    expect(entityRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', runId: 'run1' }),
      }),
    );
    const params = dataSource.query.mock.calls[0][1] as unknown[];
    // entity_key values bound are exactly the cluster's own key -- nothing
    // minted fresh, nothing reordered.
    expect(params).toContain('stable-key');
  });

  it('uses the staged-source form of sourceRef when the project reads from staged data', async () => {
    entityRepo.find.mockResolvedValue([
      { entityKey: 'E2', flagged: false, size: 1, members: [{ sourceKey: 'z' }] },
    ]);
    await service.publish(stagedProject, run);
    const params = dataSource.query.mock.calls[0][1] as unknown[];
    expect(params).toContain('staged:s1');
  });

  it('chunks the insert so no single statement exceeds PostgreSQL\'s 65535 bound-parameter cap', async () => {
    const members = Array.from({ length: 20000 }, (_, i) => ({ sourceKey: `k${i}` }));
    entityRepo.find.mockResolvedValue([{ entityKey: 'BIG', flagged: false, size: members.length, members }]);

    const out = await service.publish(project, run);
    expect(out.written).toBe(20000);
    expect(dataSource.query.mock.calls.length).toBeGreaterThan(1);
    for (const call of dataSource.query.mock.calls) {
      const params = call[1] as unknown[];
      expect(params.length).toBeLessThanOrEqual(65535);
    }
  });
});
