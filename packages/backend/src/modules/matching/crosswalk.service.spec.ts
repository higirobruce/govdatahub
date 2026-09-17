import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CrosswalkService } from './crosswalk.service';
import { MatchEntity } from '../../database/entities';
import type { MatchProject, MatchRun } from '../../database/entities';

/**
 * `CrosswalkService` reads this run's clusters off `MatchEntity` (via the
 * repository, not raw SQL) and writes `match_crosswalk` with one
 * parameterized, multi-row `INSERT ... ON CONFLICT DO UPDATE` per chunk,
 * all inside one `dataSource.transaction(...)` call.
 *
 * `dataSource.transaction` is mocked here to invoke its callback with a
 * manager whose `query` **is** `dataSource.query` (the same jest mock) --
 * so every test below that inspects `dataSource.query.mock.calls` is
 * inspecting exactly what ran inside the transaction, without needing a
 * separate manager mock per test. Only the transaction-specific tests
 * (wrapping, rollback-on-failure) need to override this default.
 *
 * `dataSource.query`/`dataSource.transaction` are mocked wholesale, so
 * these tests read the generated SQL text and call shape but cannot
 * verify the statements execute against real PostgreSQL -- see the task
 * report for the by-hand read of every statement against the migration.
 */
describe('CrosswalkService', () => {
  let service: CrosswalkService;

  const dataSource = { query: jest.fn(), transaction: jest.fn() };
  const entityRepo = { find: jest.fn() };

  const CONNECTION_REF = 'connection:c1:public.citizens';
  const STAGED_REF = 'staged:s1';

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
    // Default: delegate straight through to `dataSource.query`, so a
    // mid-loop rollback test is the only one that needs to override this.
    dataSource.transaction.mockImplementation(async (cb: (manager: { query: jest.Mock }) => Promise<unknown>) =>
      cb({ query: dataSource.query }),
    );
    entityRepo.find.mockResolvedValue([
      {
        entityKey: 'E1',
        flagged: false,
        size: 2,
        members: [
          { sourceRef: CONNECTION_REF, sourceKey: 'a' },
          { sourceRef: CONNECTION_REF, sourceKey: 'b' },
        ],
      },
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
      {
        entityKey: 'E1',
        flagged: false,
        size: 2,
        members: [
          { sourceRef: CONNECTION_REF, sourceKey: 'a' },
          { sourceRef: CONNECTION_REF, sourceKey: 'b' },
        ],
      },
    ]);
    const out = await service.publish(project, run);
    expect(out.written).toBe(2);
  });

  it('never writes a flagged cluster to the crosswalk', async () => {
    entityRepo.find.mockResolvedValue([
      {
        entityKey: 'E1',
        flagged: true,
        size: 2,
        members: [
          { sourceRef: CONNECTION_REF, sourceKey: 'a' },
          { sourceRef: CONNECTION_REF, sourceKey: 'b' },
        ],
      },
    ]);
    const out = await service.publish(project, run);
    expect(out.written).toBe(0);
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('upserts so a re-run updates rather than duplicating', async () => {
    await service.publish(project, run);
    const sql = String(dataSource.query.mock.calls[0][0]);
    expect(sql).toContain('ON CONFLICT ("organization_id", "project_id", "source_ref", "source_key")');
    expect(sql).toContain('DO UPDATE SET');
  });

  it('writes confidence as NULL rather than a fabricated value (Ruling R27)', async () => {
    entityRepo.find.mockResolvedValue([
      {
        entityKey: 'E1',
        flagged: false,
        size: 2,
        members: [
          { sourceRef: CONNECTION_REF, sourceKey: 'a' },
          { sourceRef: CONNECTION_REF, sourceKey: 'b' },
        ],
      },
    ]);
    await service.publish(project, run);
    const sql = String(dataSource.query.mock.calls[0][0]);
    const params = dataSource.query.mock.calls[0][1] as unknown[];
    expect(sql).toContain('$6::double precision');
    // Six bound params per row (org, project, source_ref, source_key,
    // entity_key, confidence); the sixth slot in each group of six is
    // confidence, and phase 1 must never write it as anything but NULL --
    // see the doc comment on `upsertChunk` for why a constant was rejected.
    // This is a single-statement (two-row) publish -- it does not exercise
    // a chunk boundary; the chunking test below covers that separately.
    expect(params[5]).toBeNull();
    expect(params[11]).toBeNull();
  });

  it('scopes the read to this run, project and organization, never regenerating entity_key', async () => {
    entityRepo.find.mockResolvedValue([
      {
        entityKey: 'stable-key',
        flagged: false,
        size: 2,
        members: [
          { sourceRef: CONNECTION_REF, sourceKey: 'a' },
          { sourceRef: CONNECTION_REF, sourceKey: 'b' },
        ],
      },
    ]);
    await service.publish(project, run);
    expect(entityRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1', projectId: 'p1', runId: 'run1' }),
      }),
    );
    const params = dataSource.query.mock.calls[0][1] as unknown[];
    // entity_key values bound are exactly the cluster's own key -- nothing
    // minted fresh, nothing reordered.
    expect(params).toContain('stable-key');
  });

  it("writes each member's own persisted sourceRef verbatim, not project.leftSource and not members[0]'s", async () => {
    // Two members of the *same* cluster carrying different sourceRefs is
    // not a phase-1 shape (one Match Source per dedupe project), but it is
    // exactly the case that distinguishes "read per member" from "compute
    // once, or copy from the first member" -- and phase 3 does introduce a
    // second source, so this is the behaviour that must already be right.
    entityRepo.find.mockResolvedValue([
      {
        entityKey: 'E1',
        flagged: false,
        size: 2,
        members: [
          { sourceRef: CONNECTION_REF, sourceKey: 'a' },
          { sourceRef: STAGED_REF, sourceKey: 'b' },
        ],
      },
    ]);
    await service.publish(project, run);
    const params = dataSource.query.mock.calls[0][1] as unknown[];
    // 6 params/row: org, project, source_ref, source_key, entity_key, confidence.
    expect(params[2]).toBe(CONNECTION_REF);
    expect(params[8]).toBe(STAGED_REF);
  });

  it('wraps the whole publish in a single transaction', async () => {
    entityRepo.find.mockResolvedValue([
      {
        entityKey: 'A',
        flagged: false,
        size: 2,
        members: [
          { sourceRef: CONNECTION_REF, sourceKey: 'a' },
          { sourceRef: CONNECTION_REF, sourceKey: 'b' },
        ],
      },
      {
        entityKey: 'B',
        flagged: false,
        size: 1,
        members: [{ sourceRef: CONNECTION_REF, sourceKey: 'c' }],
      },
    ]);
    await service.publish(project, run);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back so a mid-loop chunk failure leaves nothing written', async () => {
    // 20,000 members forces at least 2 chunks (10,922 rows/statement).
    // The second chunk's `manager.query` rejects; a real PostgreSQL
    // transaction rolls back everything issued on its manager when the
    // callback throws, so asserting (a) both chunks went through the one
    // transactional manager and (b) `publish` itself rejects is what a
    // mocked unit test can show of "nothing is left durable" -- the
    // atomicity guarantee itself comes from `dataSource.transaction`,
    // which this test does not reimplement.
    const members = Array.from({ length: 20000 }, (_, i) => ({
      sourceRef: CONNECTION_REF,
      sourceKey: `k${i}`,
    }));
    entityRepo.find.mockResolvedValue([{ entityKey: 'BIG', flagged: false, size: members.length, members }]);

    const managerQuery = jest.fn();
    managerQuery.mockResolvedValueOnce(undefined); // chunk 1 succeeds
    managerQuery.mockRejectedValueOnce(new Error('boom')); // chunk 2 fails mid-loop

    dataSource.transaction.mockImplementation(
      async (cb: (manager: { query: jest.Mock }) => Promise<unknown>) => cb({ query: managerQuery }),
    );

    await expect(service.publish(project, run)).rejects.toThrow('boom');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(managerQuery).toHaveBeenCalledTimes(2);
    // Nothing ever went through the non-transactional path -- every
    // statement this publish issued was on the transaction's own manager.
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it(
    "chunks the insert so no single statement exceeds PostgreSQL's 65535 bound-parameter cap, " +
      'and confidence stays NULL across every chunk of a genuinely multi-statement publish',
    async () => {
      const members = Array.from({ length: 20000 }, (_, i) => ({
        sourceRef: CONNECTION_REF,
        sourceKey: `k${i}`,
      }));
      entityRepo.find.mockResolvedValue([{ entityKey: 'BIG', flagged: false, size: members.length, members }]);

      const out = await service.publish(project, run);
      expect(out.written).toBe(20000);
      // 20,000 > 10,922 rows/statement, so this genuinely crosses a chunk
      // boundary -- more than one `dataSource.query` call is issued below.
      expect(dataSource.query.mock.calls.length).toBeGreaterThan(1);
      for (const call of dataSource.query.mock.calls) {
        const params = call[1] as unknown[];
        expect(params.length).toBeLessThanOrEqual(65535);
        for (let i = 5; i < params.length; i += 6) {
          expect(params[i]).toBeNull();
        }
      }
    },
  );
});
