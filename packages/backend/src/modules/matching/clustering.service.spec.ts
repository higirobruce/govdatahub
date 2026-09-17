import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClusteringService, unionFind } from './clustering.service';
import { MatchEntity } from '../../database/entities';
import type { MatchProject, MatchRun } from '../../database/entities';

describe('unionFind', () => {
  it('groups transitively connected keys into one cluster', () => {
    const out = unionFind([
      ['a', 'b'],
      ['b', 'c'],
      ['x', 'y'],
    ]);
    const groups = [...out.values()].map((g) => g.sort().join(',')).sort();
    expect(groups).toEqual(['a,b,c', 'x,y']);
  });

  it('leaves an unpaired key out entirely', () => {
    const out = unionFind([['a', 'b']]);
    expect([...out.values()].flat()).not.toContain('z');
  });

  it('treats a self-loop pair as a single-member group, not an error', () => {
    const out = unionFind([['a', 'a']]);
    expect([...out.values()]).toEqual([['a']]);
  });

  it('handles a long chain without stack overflow and clusters it as one group', () => {
    const n = 5000;
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n - 1; i++) pairs.push([`k${i}`, `k${i + 1}`]);
    const out = unionFind(pairs);
    expect(out.size).toBe(1);
    expect([...out.values()][0].length).toBe(n);
  });
});

/**
 * `ClusteringService` reads two shapes of raw SQL off `DataSource.query`:
 *  1. the survivor set (`decision IN ('auto_match', 'confirmed')`) used to
 *     build the union-find edge list;
 *  2. the over-merge guard's per-cluster internal-pair read
 *     (`left_key = ANY($2) AND right_key = ANY($2)`, no decision filter);
 *  3. the majority-entity-key read off `match_crosswalk`.
 * The mock below routes on SQL text/params so each test only needs to set
 * the rows relevant to it, mirroring the routing style already used in
 * `scoring.service.spec.ts`.
 */
describe('ClusteringService', () => {
  let service: ClusteringService;

  let survivorRows: Array<{ left_key: string; right_key: string; score: number; decision: string }> = [];
  let internalPairRows: Array<{ left_key: string; right_key: string; score: number; decision: string }> = [];
  let crosswalkRows: Array<{ source_key: string; entity_key: string }> = [];

  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("decision IN ('auto_match', 'confirmed')")) return survivorRows;
    if (sql.includes('match_crosswalk')) return crosswalkRows;
    if (sql.includes('FROM match_candidates')) return internalPairRows;
    throw new Error(`Unexpected query in test: ${sql} ${JSON.stringify(params)}`);
  });

  const dataSource = { query };

  const entityRepo = {
    save: jest.fn(async (entity: unknown) => entity),
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
    survivorRows = [];
    internalPairRows = [];
    crosswalkRows = [];
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("decision IN ('auto_match', 'confirmed')")) return survivorRows;
      if (sql.includes('match_crosswalk')) return crosswalkRows;
      if (sql.includes('FROM match_candidates')) return internalPairRows;
      throw new Error(`Unexpected query in test: ${sql} ${JSON.stringify(params)}`);
    });

    const mod = await Test.createTestingModule({
      providers: [
        ClusteringService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(MatchEntity), useValue: entityRepo },
      ],
    }).compile();
    service = mod.get(ClusteringService);
  });

  describe('the over-merge guard (Ruling R26)', () => {
    it('flags a cluster when an internal pair is missing from match_candidates -- absence is evidence, not a gap', async () => {
      // a~b at 0.95 and b~c at 0.95 put a, b, c in one cluster, but a~c
      // scored below rejectAt (0.55) and so was never stored at all.
      survivorRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
      ];
      internalPairRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
        // a~c: absent on purpose.
      ];

      const result = await service.cluster(project, run);
      expect(result.clusters).toBe(1);
      expect(result.flagged).toBe(1);
      const saved = entityRepo.save.mock.calls[0][0] as { flagged: boolean };
      expect(saved.flagged).toBe(true);
    });

    it('does not flag a cluster whose internal pairs are all present and clear rejectAt', async () => {
      survivorRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
      ];
      internalPairRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
        { left_key: 'a', right_key: 'c', score: 0.8, decision: 'grey' },
      ];

      const result = await service.cluster(project, run);
      expect(result.flagged).toBe(0);
      const saved = entityRepo.save.mock.calls[0][0] as { flagged: boolean };
      expect(saved.flagged).toBe(false);
    });

    it('R26: a confirmed decision clears the threshold test even when the score is below rejectAt', async () => {
      survivorRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
      ];
      internalPairRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
        // a~c: a steward confirmed this pair despite a score under rejectAt.
        // The bare score test (0.4 < 0.55) would wrongly flag this cluster.
        { left_key: 'a', right_key: 'c', score: 0.4, decision: 'confirmed' },
      ];

      const result = await service.cluster(project, run);
      expect(result.flagged).toBe(0);
    });

    it('R26: a rejected decision hard-flags the cluster no matter how high the score', async () => {
      survivorRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
      ];
      internalPairRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
        // a~c: a steward said "different people" even though the score is
        // high. The bare score test (0.99 >= 0.55) would wrongly clear this.
        { left_key: 'a', right_key: 'c', score: 0.99, decision: 'rejected' },
      ];

      const result = await service.cluster(project, run);
      expect(result.flagged).toBe(1);
    });

    it('R26: any other decision falls back to the plain score test', async () => {
      survivorRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
      ];
      internalPairRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
        { left_key: 'a', right_key: 'c', score: 0.4, decision: 'grey' },
      ];

      const result = await service.cluster(project, run);
      expect(result.flagged).toBe(1);
    });
  });

  describe('stable entity keys', () => {
    beforeEach(() => {
      survivorRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
      ];
      internalPairRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'b', right_key: 'c', score: 0.95, decision: 'auto_match' },
        { left_key: 'a', right_key: 'c', score: 0.8, decision: 'grey' },
      ];
    });

    it("reuses the entity key held by the majority of a cluster's previous members", async () => {
      crosswalkRows = [
        { source_key: 'a', entity_key: 'E1' },
        { source_key: 'b', entity_key: 'E1' },
        { source_key: 'c', entity_key: 'E2' },
      ];
      await service.cluster(project, run);
      expect((entityRepo.save.mock.calls[0][0] as { entityKey: string }).entityKey).toBe('E1');
    });

    it('breaks a majority tie by the lexicographically smallest entity key', async () => {
      crosswalkRows = [
        { source_key: 'a', entity_key: 'E2' },
        { source_key: 'b', entity_key: 'E1' },
      ];
      await service.cluster(project, run);
      expect((entityRepo.save.mock.calls[0][0] as { entityKey: string }).entityKey).toBe('E1');
    });

    it('mints a fresh entity key for a cluster with no previous members', async () => {
      crosswalkRows = [];
      await service.cluster(project, run);
      expect((entityRepo.save.mock.calls[0][0] as { entityKey: string }).entityKey).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('members and the golden record', () => {
    it('leaves the golden record empty because survivorship is phase 3', async () => {
      survivorRows = [{ left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' }];
      internalPairRows = [{ left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' }];

      await service.cluster(project, run);
      expect((entityRepo.save.mock.calls[0][0] as { golden: unknown }).golden).toEqual({});
    });

    it('builds member sourceRef as connection:<id>:<schema>.<table> for a connection source', async () => {
      survivorRows = [{ left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' }];
      internalPairRows = [{ left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' }];

      await service.cluster(project, run);
      const saved = entityRepo.save.mock.calls[0][0] as { members: Array<{ sourceRef: string; sourceKey: string }> };
      expect(saved.members.sort((x, y) => x.sourceKey.localeCompare(y.sourceKey))).toEqual([
        { sourceRef: 'connection:c1:public.citizens', sourceKey: 'a' },
        { sourceRef: 'connection:c1:public.citizens', sourceKey: 'b' },
      ]);
    });

    it('builds member sourceRef as staged:<stagedDataId> for a staged source', async () => {
      const stagedProject = {
        ...project,
        leftSource: { kind: 'staged', stagedDataId: 'sd1', primaryKey: 'id' },
      } as unknown as MatchProject;
      survivorRows = [{ left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' }];
      internalPairRows = [{ left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' }];

      await service.cluster(stagedProject, run);
      const saved = entityRepo.save.mock.calls[0][0] as { members: Array<{ sourceRef: string }> };
      expect(saved.members[0].sourceRef).toBe('staged:sd1');
    });
  });

  describe('multiple clusters in one run', () => {
    it('saves one entity per cluster and counts clusters/flagged independently', async () => {
      survivorRows = [
        { left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' },
        { left_key: 'x', right_key: 'y', score: 0.95, decision: 'auto_match' },
        { left_key: 'y', right_key: 'z', score: 0.95, decision: 'auto_match' },
      ];
      query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes("decision IN ('auto_match', 'confirmed')")) return survivorRows;
        if (sql.includes('match_crosswalk')) return [];
        if (sql.includes('FROM match_candidates')) {
          const members = (params as unknown[])[1] as string[];
          if (members.includes('x')) {
            // {x,y,z}: x~y and y~z present and clean; x~z missing entirely.
            return [
              { left_key: 'x', right_key: 'y', score: 0.95, decision: 'auto_match' },
              { left_key: 'y', right_key: 'z', score: 0.95, decision: 'auto_match' },
            ];
          }
          return [{ left_key: 'a', right_key: 'b', score: 0.95, decision: 'auto_match' }];
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await service.cluster(project, run);
      expect(result.clusters).toBe(2);
      expect(result.flagged).toBe(1);
      expect(entityRepo.save).toHaveBeenCalledTimes(2);
      const savedFlags = entityRepo.save.mock.calls.map((c) => (c[0] as { flagged: boolean }).flagged).sort();
      expect(savedFlags).toEqual([false, true]);
    });
  });
});
