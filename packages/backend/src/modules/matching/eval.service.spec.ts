import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EvalService } from './eval.service';
import { MatchGoldPair } from '../../database/entities';
import type { MatchProject } from '../../database/entities';

/**
 * `EvalService` reads the hand-labelled gold set off `MatchGoldPair` (via
 * the repository, so `left_key`/`right_key`/`is_match` arrive as the
 * camelCase `leftKey`/`rightKey`/`isMatch` the entity declares) and this
 * run's scored candidates off `match_candidates` via raw SQL, since that
 * table has no entity of its own (see `ScoringService`, which writes it
 * the same way).
 *
 * Gold set: (a,b) match, (c,d) match, (e,f) not a match.
 * Scores:   (a,b)=0.95, (c,d)=0.60, (e,f)=0.92.
 */
describe('EvalService', () => {
  let service: EvalService;

  const dataSource = { query: jest.fn() };
  const goldRepo = { find: jest.fn() };

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

  const DEFAULT_GOLD = [
    { leftKey: 'a', rightKey: 'b', isMatch: true },
    { leftKey: 'c', rightKey: 'd', isMatch: true },
    { leftKey: 'e', rightKey: 'f', isMatch: false },
  ];

  const DEFAULT_CANDIDATES = [
    { left_key: 'a', right_key: 'b', score: 0.95 },
    { left_key: 'c', right_key: 'd', score: 0.6 },
    { left_key: 'e', right_key: 'f', score: 0.92 },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    goldRepo.find.mockResolvedValue(DEFAULT_GOLD);
    dataSource.query.mockResolvedValue(DEFAULT_CANDIDATES);

    const mod = await Test.createTestingModule({
      providers: [
        EvalService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(MatchGoldPair), useValue: goldRepo },
      ],
    }).compile();
    service = mod.get(EvalService);
  });

  it('computes precision, recall and F1 at a threshold', async () => {
    const m = await service.evaluate(project, 'run1', 0.9);
    // Predicted matches at 0.9: (a,b) and (e,f). TP=1, FP=1, FN=1.
    expect(m.truePositives).toBe(1);
    expect(m.falsePositives).toBe(1);
    expect(m.falseNegatives).toBe(1);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.f1).toBeCloseTo(0.5);
  });

  it('counts a gold match that blocking never proposed as a false negative', async () => {
    // Gold says (g,h) match, but no Blocking Pass proposed the pair, so it is
    // absent from match_candidates entirely. A missing pair is a miss, not a pass.
    goldRepo.find.mockResolvedValue([{ leftKey: 'g', rightKey: 'h', isMatch: true }]);
    dataSource.query.mockResolvedValue([]); // no candidates at all
    const m = await service.evaluate(project, 'run1', 0.5);
    expect(m.truePositives).toBe(0);
    expect(m.falseNegatives).toBe(1);
    expect(m.recall).toBe(0);
  });

  it('returns zeroes rather than NaN when nothing is predicted', async () => {
    const m = await service.evaluate(project, 'run1', 0.999);
    expect(m.precision).toBe(0);
    expect(m.f1).toBe(0);
    expect(Number.isNaN(m.f1)).toBe(false);
  });

  it('throws when the gold set is empty, rather than reporting a perfect score', async () => {
    goldRepo.find.mockResolvedValue([]);
    await expect(service.evaluate(project, 'run1', 0.9)).rejects.toThrow(/gold set/i);
  });

  it('sweeps thresholds in ascending order', async () => {
    const points = await service.sweep(project, 'run1');
    expect(points[0].matchAt).toBeCloseTo(0.5);
    expect(points[points.length - 1].matchAt).toBeCloseTo(0.99);
    expect(points.length).toBe(50);
  });

  // --- Additional tests: self-review requires these be exercised directly,
  // not inferred from the tests above.

  it('returns recall zero, not NaN, when the gold set has no positive pairs at all', async () => {
    goldRepo.find.mockResolvedValue([{ leftKey: 'e', rightKey: 'f', isMatch: false }]);
    dataSource.query.mockResolvedValue([{ left_key: 'e', right_key: 'f', score: 0.92 }]);
    const m = await service.evaluate(project, 'run1', 0.5);
    expect(m.recall).toBe(0);
    expect(Number.isNaN(m.recall)).toBe(false);
    // (e,f) is a non-match gold pair predicted as a match at 0.5 -- it is a
    // false positive, not silently dropped.
    expect(m.falsePositives).toBe(1);
  });

  it('normalizes gold-pair key order before matching a candidate stored left_key < right_key', async () => {
    // The gold pair was labelled (b, a) -- reversed relative to how the
    // self-join guard stored the candidate as (a, b). Ruling: normalize
    // both sides before comparing, or a correctly-labelled pair reads as a
    // miss.
    goldRepo.find.mockResolvedValue([{ leftKey: 'b', rightKey: 'a', isMatch: true }]);
    dataSource.query.mockResolvedValue([{ left_key: 'a', right_key: 'b', score: 0.95 }]);
    const m = await service.evaluate(project, 'run1', 0.9);
    expect(m.truePositives).toBe(1);
    expect(m.falseNegatives).toBe(0);
  });

  it('coerces a stringified candidate score from the wire before comparing it to matchAt', async () => {
    goldRepo.find.mockResolvedValue([{ leftKey: 'a', rightKey: 'b', isMatch: true }]);
    dataSource.query.mockResolvedValue([{ left_key: 'a', right_key: 'b', score: '0.95' }]);
    const m = await service.evaluate(project, 'run1', 0.9);
    expect(m.truePositives).toBe(1);
  });

  it('throws rather than silently producing NaN when a candidate score is not numeric', async () => {
    goldRepo.find.mockResolvedValue([{ leftKey: 'a', rightKey: 'b', isMatch: true }]);
    dataSource.query.mockResolvedValue([{ left_key: 'a', right_key: 'b', score: 'not-a-number' }]);
    await expect(service.evaluate(project, 'run1', 0.9)).rejects.toThrow();
  });

  it('loads the gold set and the candidates exactly once for the whole sweep, not per threshold', async () => {
    const points = await service.sweep(project, 'run1');
    expect(points.length).toBe(50);
    expect(goldRepo.find).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('reports honest, uncollapsed metrics at the top of the sweep range where recall drops', async () => {
    // At matchAt=0.99 nothing here clears the bar: only (a,b)=0.95 and
    // (e,f)=0.92 were ever proposed, and both fall short. Recall must read
    // as the real 0, not be smoothed, clamped, or omitted from the range.
    const points = await service.sweep(project, 'run1');
    const top = points[points.length - 1];
    expect(top.matchAt).toBeCloseTo(0.99);
    expect(top.metrics.truePositives).toBe(0);
    expect(top.metrics.recall).toBe(0);
    expect(Number.isNaN(top.metrics.recall)).toBe(false);
  });
});
