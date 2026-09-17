import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AiProvider, MatchProject, MatchRun } from '../../database/entities';
import { BlockingService } from './blocking.service';
import { ClusteringService } from './clustering.service';
import { CrosswalkService } from './crosswalk.service';
import { MaterializeService } from './materialize.service';
import { MatchRunService } from './match-run.service';
import { ScoringService } from './scoring.service';
import { SettingsService } from '../settings/settings.service';

/**
 * `MatchRunService` is the first code that composes the nine engine
 * services, so these tests are about *composition*: the stage order, the
 * counters accumulated across passes, the advisory lock that serializes
 * runs of one project, and the failure capture. Every collaborator is a
 * jest mock -- none of their SQL runs here; Task 15's integration test is
 * what executes the generated SQL.
 *
 * Two mocking details matter for reading the assertions below:
 *
 *  - `runRepo.save` is called with a *snapshot* of the run, not the live
 *    mutable entity, so `runRepo.save.mock.calls.map(c => c[0].status)` is
 *    a genuine history of the statuses the run passed through. If the
 *    service ever saved the live object instead, every recorded call
 *    would show the same final status and the ordering test would be
 *    vacuous.
 *  - `dataSource.createQueryRunner` returns one shared runner mock whose
 *    `query` answers `[{ locked: true }]` by default, which is what
 *    `pg_try_advisory_lock` returns when the lock is free.
 */
describe('MatchRunService', () => {
  let service: MatchRunService;

  const runnerQuery = jest.fn();
  const runnerConnect = jest.fn();
  const runnerRelease = jest.fn();
  const queryRunner = { connect: runnerConnect, query: runnerQuery, release: runnerRelease };

  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn(),
    createQueryRunner: jest.fn(() => queryRunner),
  };

  const runRepo = { findOne: jest.fn(), save: jest.fn() };
  const projectRepo = { findOne: jest.fn() };
  const settings = { getOrganizationSettings: jest.fn() };
  const materialize = { materialize: jest.fn(), workspaceTable: jest.fn() };
  const blocking = { estimate: jest.fn() };
  const scoring = { scorePass: jest.fn() };
  const clustering = { cluster: jest.fn() };
  const crosswalk = { publish: jest.fn() };

  const baseProject = (): MatchProject =>
    ({
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
      blockingPasses: [
        { name: 'name_dob', kind: 'equi', keyExpr: 'surname' },
        { name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 },
      ],
      thresholds: { matchAt: 0.9, rejectAt: 0.55 },
      columnAllowlist: ['id', 'surname'],
      lawfulBasis: 'Law No. 058/2021 art. 12',
      dataOwner: 'registrar@example.gov',
      retentionDays: 30,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as unknown as MatchProject;

  /** A fresh, mutable `pending` run per test -- the service mutates it. */
  const baseRun = (startedAt = new Date(Date.now() - 5_000)): MatchRun =>
    ({
      id: 'r1',
      organizationId: 'org1',
      projectId: 'p1',
      status: 'pending',
      counters: {},
      watermarks: {},
      droppedKeys: [],
      startedAt,
      finishedAt: null,
      durationMs: null,
      errorMessage: null,
    }) as unknown as MatchRun;

  /** The run object as it was handed to the last `runRepo.save` call. */
  const lastSaved = (): MatchRun => runRepo.save.mock.calls[runRepo.save.mock.calls.length - 1][0] as MatchRun;

  const statusHistory = (): string[] => runRepo.save.mock.calls.map((c) => (c[0] as MatchRun).status);

  /** Lets the `setImmediate` in `start` fire. */
  const flushImmediate = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    runnerConnect.mockResolvedValue(undefined);
    runnerRelease.mockResolvedValue(undefined);
    runnerQuery.mockResolvedValue([{ locked: true }]);

    settings.getOrganizationSettings.mockResolvedValue({ aiProvider: AiProvider.LOCAL });
    projectRepo.findOne.mockResolvedValue(baseProject());
    runRepo.findOne.mockResolvedValue(baseRun());
    runRepo.save.mockImplementation(async (entity: MatchRun) => entity);

    materialize.materialize.mockResolvedValue({ rows: 10_000, lastKey: 'zzz' });
    blocking.estimate.mockResolvedValue({
      perPass: [
        { pass: 'name_dob', distinctKeys: 9_000, estimatedPairs: 1_000, droppedKeys: [], exact: true },
        { pass: 'near_name', distinctKeys: 9_500, estimatedPairs: 12, droppedKeys: [], exact: false },
      ],
      totalEstimatedPairs: 1_012,
      hasInexactPass: true,
      exceedsCap: false,
      refused: false,
    });
    scoring.scorePass.mockResolvedValue({ inserted: 10, autoMatch: 4, grey: 6, autoReject: 90 });
    clustering.cluster.mockResolvedValue({ clusters: 120, flagged: 3 });
    crosswalk.publish.mockResolvedValue({ written: 240 });

    const mod = await Test.createTestingModule({
      providers: [
        MatchRunService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(MatchRun), useValue: runRepo },
        { provide: getRepositoryToken(MatchProject), useValue: projectRepo },
        { provide: SettingsService, useValue: settings },
        { provide: MaterializeService, useValue: materialize },
        { provide: BlockingService, useValue: blocking },
        { provide: ScoringService, useValue: scoring },
        { provide: ClusteringService, useValue: clustering },
        { provide: CrosswalkService, useValue: crosswalk },
      ],
    }).compile();

    service = mod.get(MatchRunService);
  });

  // ---------------------------------------------------------------- start

  it('refuses to start when the organization uses a hosted AI provider', async () => {
    settings.getOrganizationSettings.mockResolvedValue({ aiProvider: AiProvider.OPENAI });
    await expect(service.start('p1', 'org1')).rejects.toThrow(BadRequestException);
  });

  it('creates no run at all when the provider check fails', async () => {
    settings.getOrganizationSettings.mockResolvedValue({ aiProvider: AiProvider.ANTHROPIC });
    await expect(service.start('p1', 'org1')).rejects.toThrow(BadRequestException);
    expect(runRepo.save).not.toHaveBeenCalled();
  });

  it('refuses to start a project belonging to another organization', async () => {
    projectRepo.findOne.mockResolvedValue(null);
    await expect(service.start('p1', 'org1')).rejects.toThrow(NotFoundException);
    expect(projectRepo.findOne).toHaveBeenCalledWith({ where: { id: 'p1', organizationId: 'org1' } });
  });

  it('returns a pending run without awaiting the pipeline', async () => {
    // A real run takes one to two hours; if `start` awaited `execute` this
    // test would hang on the never-resolving promise rather than pass.
    const never = new Promise<void>(() => {});
    const executeSpy = jest.spyOn(service, 'execute').mockReturnValue(never);

    const run = await service.start('p1', 'org1');

    expect(run.status).toBe('pending');
    // Deferred to setImmediate, so it cannot have run yet.
    expect(executeSpy).not.toHaveBeenCalled();
    await flushImmediate();
    expect(executeSpy).toHaveBeenCalledWith(run.id, 'org1');
  });

  it('logs a background pipeline failure instead of leaving an unhandled rejection', async () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(service, 'execute').mockRejectedValue(new Error('source unreachable'));

    await service.start('p1', 'org1');
    await flushImmediate();
    await Promise.resolve();

    expect(errorLog).toHaveBeenCalled();
    expect(String(errorLog.mock.calls[0][0])).toContain('source unreachable');
  });

  // -------------------------------------------------------------- execute

  it('refuses to execute a run belonging to another organization', async () => {
    runRepo.findOne.mockResolvedValue(null);
    await expect(service.execute('r1', 'org1')).rejects.toThrow(NotFoundException);
    expect(runRepo.findOne).toHaveBeenCalledWith({ where: { id: 'r1', organizationId: 'org1' } });
  });

  it('marks the run failed when its project has gone, rather than leaving it pending', async () => {
    projectRepo.findOne.mockResolvedValue(null);
    await expect(service.execute('r1', 'org1')).rejects.toThrow(NotFoundException);
    const saved = lastSaved();
    expect(saved.status).toBe('failed');
    expect(saved.durationMs).toBeGreaterThanOrEqual(5_000);
    // Nothing was locked, because nothing was ever attempted.
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('refuses to start when the blocking estimate is above twice the cap', async () => {
    blocking.estimate.mockResolvedValue({
      perPass: [],
      totalEstimatedPairs: 9e9,
      hasInexactPass: false,
      exceedsCap: true,
      refused: true,
    });
    await expect(service.execute('r1', 'org1')).rejects.toThrow(/estimate/i);
    expect(lastSaved().status).toBe('failed');
    expect(scoring.scorePass).not.toHaveBeenCalled();
  });

  it('moves through the statuses in order', async () => {
    await service.execute('r1', 'org1');
    const statuses = statusHistory();
    expect(statuses).toEqual(
      expect.arrayContaining(['materializing', 'blocking', 'scoring', 'clustering', 'completed']),
    );
    expect(statuses[statuses.length - 1]).toBe('completed');
    expect(statuses.indexOf('materializing')).toBeLessThan(statuses.indexOf('blocking'));
    expect(statuses.indexOf('blocking')).toBeLessThan(statuses.indexOf('scoring'));
    expect(statuses.indexOf('scoring')).toBeLessThan(statuses.indexOf('clustering'));
  });

  it('runs the stages in the documented order', async () => {
    const order: string[] = [];
    materialize.materialize.mockImplementation(async () => {
      order.push('materialize');
      return { rows: 10, lastKey: 'z' };
    });
    blocking.estimate.mockImplementation(async () => {
      order.push('estimate');
      return {
        perPass: [
          { pass: 'name_dob', distinctKeys: 1, estimatedPairs: 1, droppedKeys: [], exact: true },
          { pass: 'near_name', distinctKeys: 1, estimatedPairs: 0, droppedKeys: [], exact: true },
        ],
        totalEstimatedPairs: 1,
        hasInexactPass: false,
        exceedsCap: false,
        refused: false,
      };
    });
    scoring.scorePass.mockImplementation(async () => {
      order.push('score');
      return { inserted: 1, autoMatch: 1, grey: 0, autoReject: 0 };
    });
    clustering.cluster.mockImplementation(async () => {
      order.push('cluster');
      return { clusters: 1, flagged: 0 };
    });
    crosswalk.publish.mockImplementation(async () => {
      order.push('publish');
      return { written: 2 };
    });

    await service.execute('r1', 'org1');

    // Two blocking passes on the project, so two scoring stages.
    expect(order).toEqual(['materialize', 'estimate', 'score', 'score', 'cluster', 'publish']);
  });

  it('accumulates counters across every blocking pass', async () => {
    scoring.scorePass
      .mockResolvedValueOnce({ inserted: 10, autoMatch: 4, grey: 6, autoReject: 90 })
      .mockResolvedValueOnce({ inserted: 5, autoMatch: 1, grey: 4, autoReject: 45 });
    await service.execute('r1', 'org1');
    const saved = lastSaved();
    expect(scoring.scorePass).toHaveBeenCalledTimes(2);
    expect(saved.counters.autoMatch).toBe(5);
    expect(saved.counters.grey).toBe(10);
    expect(saved.counters.autoReject).toBe(135);
    // Ruling R24: pairs *seen* is inserted + not-stored, summed over passes.
    expect(saved.counters.candidatePairs).toBe(150);
    expect(saved.counters.leftRows).toBe(10_000);
    // Dedupe: there is no right side at all.
    expect(saved.counters.rightRows).toBe(0);
    expect(saved.counters.clusters).toBe(120);
    expect(saved.counters.flaggedClusters).toBe(3);
  });

  it('accumulates onto a run whose counters column is the JSONB default', async () => {
    // `counters` defaults to `{}` in the database, and `undefined += n` is
    // NaN -- a counter that reads as a number and is silently wrong.
    runRepo.findOne.mockResolvedValue({ ...baseRun(), counters: {} } as MatchRun);
    await service.execute('r1', 'org1');
    const counters = lastSaved().counters;
    expect(Object.values(counters).every((v) => typeof v === 'boolean' || Number.isFinite(v))).toBe(true);
    expect(counters.autoMatch).toBe(8);
    expect(counters.candidatePairs).toBe(200);
  });

  it('surfaces the estimate and its lower-bound flag on the run (Ruling R20)', async () => {
    await service.execute('r1', 'org1');
    const saved = lastSaved();
    expect(saved.counters.estimatedPairs).toBe(1_012);
    expect(saved.counters.hasInexactPass).toBe(true);
  });

  it('records hasInexactPass false for an exact-only project', async () => {
    blocking.estimate.mockResolvedValue({
      perPass: [
        { pass: 'name_dob', distinctKeys: 3, estimatedPairs: 4, droppedKeys: [], exact: true },
        { pass: 'near_name', distinctKeys: 3, estimatedPairs: 0, droppedKeys: [], exact: true },
      ],
      totalEstimatedPairs: 4,
      hasInexactPass: false,
      exceedsCap: false,
      refused: false,
    });
    await service.execute('r1', 'org1');
    expect(lastSaved().counters.hasInexactPass).toBe(false);
  });

  it('records the dropped keys the estimate found', async () => {
    blocking.estimate.mockResolvedValue({
      perPass: [
        { pass: 'name_dob', distinctKeys: 2, estimatedPairs: 3, droppedKeys: ['|1988'], exact: true },
        { pass: 'near_name', distinctKeys: 2, estimatedPairs: 1, droppedKeys: [], exact: false },
      ],
      totalEstimatedPairs: 3,
      hasInexactPass: false,
      exceedsCap: false,
      refused: false,
    });
    await service.execute('r1', 'org1');
    // Only the pass that actually dropped something is recorded.
    expect(lastSaved().droppedKeys).toEqual([{ pass: 'name_dob', keys: ['|1988'] }]);
  });

  it('threads each pass its own dropped-key exclusion list into scoring', async () => {
    blocking.estimate.mockResolvedValue({
      perPass: [
        { pass: 'name_dob', distinctKeys: 2, estimatedPairs: 3, droppedKeys: ['|1988'], exact: true },
        { pass: 'near_name', distinctKeys: 2, estimatedPairs: 1, droppedKeys: [], exact: false },
      ],
      totalEstimatedPairs: 4,
      hasInexactPass: true,
      exceedsCap: false,
      refused: false,
    });
    const project = baseProject();
    projectRepo.findOne.mockResolvedValue(project);

    await service.execute('r1', 'org1');

    expect(scoring.scorePass.mock.calls[0][2]).toEqual(project.blockingPasses[0]);
    expect(scoring.scorePass.mock.calls[0][3]).toEqual(['|1988']);
    expect(scoring.scorePass.mock.calls[1][2]).toEqual(project.blockingPasses[1]);
    expect(scoring.scorePass.mock.calls[1][3]).toEqual([]);
  });

  it('refuses a pass the estimate has no entry for, rather than scoring it unfiltered', async () => {
    // An empty exclusion list looks valid and silently readmits the
    // degenerate keys, making the pass's self-join quadratic.
    blocking.estimate.mockResolvedValue({
      perPass: [{ pass: 'name_dob', distinctKeys: 2, estimatedPairs: 3, droppedKeys: ['|1988'], exact: true }],
      totalEstimatedPairs: 3,
      hasInexactPass: false,
      exceedsCap: false,
      refused: false,
    });
    await expect(service.execute('r1', 'org1')).rejects.toThrow(/near_name/);
    expect(scoring.scorePass).toHaveBeenCalledTimes(1);
    expect(lastSaved().status).toBe('failed');
  });

  it('never wraps a scoring pass in an outer transaction (Ruling R21)', async () => {
    // `ScoringService.scorePass` opens its own transaction so its
    // `SET LOCAL pg_trgm.similarity_threshold` is in force for both of its
    // statements. An outer transaction here would change those semantics.
    await service.execute('r1', 'org1');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('marks the run failed with the error message when a stage throws', async () => {
    materialize.materialize.mockRejectedValue(new Error('source unreachable'));
    await expect(service.execute('r1', 'org1')).rejects.toThrow('source unreachable');
    const saved = lastSaved();
    expect(saved.status).toBe('failed');
    expect(saved.errorMessage).toContain('source unreachable');
    expect(saved.finishedAt).toBeInstanceOf(Date);
  });

  it('sets finishedAt and duration_ms on the success path', async () => {
    await service.execute('r1', 'org1');
    const saved = lastSaved();
    expect(saved.finishedAt).toBeInstanceOf(Date);
    expect(saved.durationMs).toBeGreaterThanOrEqual(5_000);
    expect(saved.durationMs).toBe(saved.finishedAt!.getTime() - saved.startedAt.getTime());
  });

  it('sets duration_ms on the failure path too', async () => {
    clustering.cluster.mockRejectedValue(new Error('cluster blew up'));
    await expect(service.execute('r1', 'org1')).rejects.toThrow('cluster blew up');
    const saved = lastSaved();
    expect(saved.durationMs).toBeGreaterThanOrEqual(5_000);
    expect(saved.durationMs).toBe(saved.finishedAt!.getTime() - saved.startedAt.getTime());
  });

  it('materializes only the left side for a dedupe project', async () => {
    await service.execute('r1', 'org1');
    expect(materialize.materialize).toHaveBeenCalledTimes(1);
    expect(materialize.materialize.mock.calls[0][1]).toBe('left');
  });

  it('records the materialization watermark on the run', async () => {
    await service.execute('r1', 'org1');
    expect(lastSaved().watermarks).toEqual({ left: { rows: 10_000, lastKey: 'zzz' } });
  });

  it('publishes the crosswalk without filtering flagged clusters itself', async () => {
    clustering.cluster.mockResolvedValue({ clusters: 10, flagged: 10 });
    await service.execute('r1', 'org1');
    // CrosswalkService withholds a flagged cluster; double-filtering here
    // would publish nothing at all.
    expect(crosswalk.publish).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------- advisory lock (R: serialization)

  it('serializes runs of one project with a non-blocking advisory lock', async () => {
    await service.execute('r1', 'org1');
    const lockCall = runnerQuery.mock.calls.find((c) => String(c[0]).includes('pg_try_advisory_lock'));
    expect(lockCall).toBeDefined();
    // Blocking `pg_advisory_lock` would queue a second run behind a
    // two-hour job instead of failing it fast.
    expect(String(lockCall![0])).not.toMatch(/pg_advisory_lock\s*\(/);
  });

  it('fails a second concurrent run for the same project fast, naming the reason', async () => {
    runnerQuery.mockResolvedValue([{ locked: false }]);
    await expect(service.execute('r1', 'org1')).rejects.toThrow(ConflictException);
    await expect(service.execute('r1', 'org1')).rejects.toThrow(/already (running|in progress)/i);
    expect(materialize.materialize).not.toHaveBeenCalled();
    expect(lastSaved().status).toBe('failed');
    expect(lastSaved().errorMessage).toMatch(/already (running|in progress)/i);
  });

  it('releases the query runner when the lock is refused', async () => {
    runnerQuery.mockResolvedValue([{ locked: false }]);
    await expect(service.execute('r1', 'org1')).rejects.toThrow(ConflictException);
    expect(runnerRelease).toHaveBeenCalledTimes(1);
    // Nothing was locked, so nothing may be unlocked.
    expect(runnerQuery.mock.calls.filter((c) => String(c[0]).includes('pg_advisory_unlock'))).toHaveLength(0);
  });

  it('releases the advisory lock on the success path', async () => {
    await service.execute('r1', 'org1');
    expect(runnerQuery.mock.calls.filter((c) => String(c[0]).includes('pg_advisory_unlock'))).toHaveLength(1);
    expect(runnerRelease).toHaveBeenCalledTimes(1);
  });

  it('releases the advisory lock when a stage throws', async () => {
    scoring.scorePass.mockRejectedValue(new Error('scoring exploded'));
    await expect(service.execute('r1', 'org1')).rejects.toThrow('scoring exploded');
    expect(runnerQuery.mock.calls.filter((c) => String(c[0]).includes('pg_advisory_unlock'))).toHaveLength(1);
    expect(runnerRelease).toHaveBeenCalledTimes(1);
  });

  it('takes and releases the lock on one and the same connection', async () => {
    // A session advisory lock belongs to a connection: taken on a pooled
    // connection that is then returned, it can never be released.
    await service.execute('r1', 'org1');
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(1);
    const lock = runnerQuery.mock.calls.find((c) => String(c[0]).includes('pg_try_advisory_lock'));
    const unlock = runnerQuery.mock.calls.find((c) => String(c[0]).includes('pg_advisory_unlock'));
    expect(lock![1]).toEqual(unlock![1]);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('keys the advisory lock on the project, as bound parameters', async () => {
    await service.execute('r1', 'org1');
    const lock = runnerQuery.mock.calls.find((c) => String(c[0]).includes('pg_try_advisory_lock'))!;
    expect(String(lock[0])).toMatch(/\$1/);
    expect(String(lock[0])).toMatch(/\$2/);
    expect(String(lock[0])).not.toContain('p1');
    const params = lock[1] as number[];
    expect(params).toHaveLength(2);
    expect(params.every((p) => Number.isSafeInteger(p))).toBe(true);

    // A different project hashes to a different key, so two projects never
    // block each other.
    runnerQuery.mockClear();
    const other = baseProject();
    (other as { id: string }).id = 'p2';
    projectRepo.findOne.mockResolvedValue(other);
    runRepo.findOne.mockResolvedValue({ ...baseRun(), projectId: 'p2' } as MatchRun);
    await service.execute('r1', 'org1');
    const otherLock = runnerQuery.mock.calls.find((c) => String(c[0]).includes('pg_try_advisory_lock'))!;
    expect(otherLock[1]).not.toEqual(lock[1]);
  });

  it('still releases the connection when the unlock statement itself fails', async () => {
    runnerQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('pg_try_advisory_lock')) return [{ locked: true }];
      if (String(sql).includes('pg_advisory_unlock')) throw new Error('connection reset');
      return [];
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // The unlock failing must not mask the run's own outcome.
    await expect(service.execute('r1', 'org1')).resolves.toBeUndefined();
    expect(runnerRelease).toHaveBeenCalledTimes(1);
    expect(lastSaved().status).toBe('completed');
  });
});
