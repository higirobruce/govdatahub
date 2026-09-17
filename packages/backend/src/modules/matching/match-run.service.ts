import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MatchProject, MatchRun } from '../../database/entities';
import type { BlockingPass, MatchRunCounters, MatchRunStatus, RunDroppedKeys } from '../../database/entities';
import { SettingsService } from '../settings/settings.service';
import { assertLocalProvider } from './matching-governance';
import { MaterializeService } from './materialize.service';
import { BlockingService, PassEstimate } from './blocking.service';
import { ScoringService } from './scoring.service';
import { ClusteringService } from './clustering.service';
import { CrosswalkService } from './crosswalk.service';

/**
 * `classid` for every advisory lock this service takes, so a matching-run
 * lock can never collide with an advisory lock another feature takes on a
 * numerically equal second key. PostgreSQL's two-argument
 * `pg_try_advisory_lock(int, int)` namespaces the lock by this first
 * argument; the second is the project key (see `projectLockKey`).
 */
const MATCH_RUN_LOCK_CLASS_ID = 0x4d41; // 'MA'

/**
 * Empty counters, written when the run is created so a `pending` run
 * already has every field a summary reads rather than `{}`.
 */
function emptyCounters(): MatchRunCounters {
  return {
    leftRows: 0,
    rightRows: 0,
    candidatePairs: 0,
    autoMatch: 0,
    grey: 0,
    autoReject: 0,
    clusters: 0,
    flaggedClusters: 0,
    estimatedPairs: 0,
    hasInexactPass: false,
  };
}

/**
 * Runs a match project end to end: materialize the workspace, estimate
 * the blocking passes, score each pass, cluster the survivors, publish the
 * crosswalk.
 *
 * This is the first component that composes the engine's services, and it
 * owns three things none of them can own individually:
 *
 *  1. **Serialization per project.** `MaterializeService.materialize`
 *     unconditionally drops and recreates the workspace table, and that
 *     table's name is keyed by *project*, not by run. Two concurrent runs
 *     of one project therefore share one workspace table, and one run's
 *     materializer can rewrite it underneath the other run's scoring --
 *     producing results that are silently wrong rather than failing. A
 *     PostgreSQL advisory lock on the project closes that by
 *     construction; it lives here because it must span every stage, which
 *     no single stage can do.
 *  2. **Background execution.** A real run is one to two hours, so
 *     `start` creates the run and returns; the pipeline runs detached.
 *  3. **Terminal state.** `finishedAt`/`duration_ms`/`error_message` are
 *     written on the success path *and* the failure path, so a run never
 *     sits in a non-terminal status after the process has given up on it.
 *
 * Phase 1 is dedupe-only and makes zero model calls: `assertLocalProvider`
 * refuses the run outright if the organization's AI provider is hosted,
 * before any personal data is copied anywhere.
 */
@Injectable()
export class MatchRunService {
  private readonly logger = new Logger(MatchRunService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MatchRun) private readonly runRepo: Repository<MatchRun>,
    @InjectRepository(MatchProject) private readonly projectRepo: Repository<MatchProject>,
    private readonly settings: SettingsService,
    private readonly materialize: MaterializeService,
    private readonly blocking: BlockingService,
    private readonly scoring: ScoringService,
    private readonly clustering: ClusteringService,
    private readonly crosswalk: CrosswalkService,
  ) {}

  /**
   * Validates the organization and the project, creates a `pending` run,
   * and hands the pipeline to the event loop.
   *
   * It **must not** await `execute`: a run takes one to two hours and the
   * HTTP request that started it cannot wait, so the pipeline is invoked
   * inside `setImmediate` with a `.catch` that logs. `execute` writes the
   * failure onto the run itself, so this `catch` is the last resort for
   * an error raised before that could happen (a lost database connection,
   * say) -- swallowing it silently would be how a run ends up stuck in
   * `pending` with nothing in the log.
   */
  async start(projectId: string, organizationId: string): Promise<MatchRun> {
    const settings = await this.settings.getOrganizationSettings(organizationId);
    // Before anything is created, and long before any personal data is
    // copied into a workspace table.
    assertLocalProvider(settings);

    const project = await this.loadProject(projectId, organizationId);
    if (project.mode !== 'dedupe') {
      throw new BadRequestException(
        `Phase 1 matching runs dedupe projects only; project ${project.id} is "${project.mode}"`,
      );
    }

    const run = await this.runRepo.save({
      id: uuidv4(),
      organizationId,
      projectId: project.id,
      status: 'pending' as MatchRunStatus,
      counters: emptyCounters(),
      watermarks: {},
      droppedKeys: [],
      finishedAt: null,
      durationMs: null,
      errorMessage: null,
    });

    setImmediate(() => {
      this.execute(run.id, organizationId).catch((error: Error) => {
        this.logger.error(
          `Match run ${run.id} for project ${project.id} failed: ${error.message}`,
          error.stack,
        );
      });
    });

    return run as MatchRun;
  }

  /**
   * The staged pipeline. Public (not private) because the integration
   * test and the `setImmediate` in `start` both need it, and because
   * awaiting it is the only way to test the stages without polling.
   *
   * Stage order is materialize left -> estimate -> refuse if the estimate
   * refuses -> score every pass -> cluster -> publish the crosswalk ->
   * `completed`. Every stage runs while this project's advisory lock is
   * held, and the lock is released on every exit path including a throw.
   */
  async execute(runId: string, organizationId: string): Promise<void> {
    // Loaded outside the try because a run that cannot be found is the one
    // failure there is nothing to record the failure on.
    const run = await this.loadRun(runId, organizationId);

    // `startedAt` is the run's own creation timestamp, so `duration_ms`
    // includes any time the run spent queued -- which is what an operator
    // watching a run wants to know.
    const startedAt = run.startedAt instanceof Date ? run.startedAt : new Date();

    // `counters` is JSONB whose column default is `{}`, so the compile-time
    // `MatchRunCounters` is no runtime guarantee: a run created by anything
    // other than `start` (or inserted by hand) arrives with fields missing,
    // and `undefined += n` is `NaN` -- a counter that reads as a number,
    // survives every save, and is silently wrong. Normalized once, here.
    run.counters = { ...emptyCounters(), ...(run.counters ?? {}) };

    try {
      // Inside the try: a project deleted between `start` and here must
      // leave the run `failed`, not `pending` forever.
      const project = await this.loadProject(run.projectId, organizationId);
      const lock = await this.acquireProjectLock(project.id);
      try {
        await this.runStages(run, project);
      } finally {
        // Every exit path: success, a stage throwing, or a stage being
        // cancelled. A lock left held would block this project's next run
        // for as long as the connection lives.
        await this.releaseProjectLock(lock, project.id);
      }

      await this.finish(run, startedAt, 'completed', null);
    } catch (error) {
      await this.finish(run, startedAt, 'failed', error as Error);
      throw error;
    }
  }

  /** The stages themselves, all under the project's advisory lock. */
  private async runStages(run: MatchRun, project: MatchProject): Promise<void> {
    await this.setStatus(run, 'materializing');

    // Dedupe materializes the LEFT side only. The right side of a dedupe
    // project is the same table, so materializing it would double the work
    // and defeat the `l."src_key" < r."src_key"` guard that makes each
    // candidate pair appear exactly once.
    const left = await this.materialize.materialize(project, 'left', run.id);
    run.counters.leftRows = left.rows;
    run.counters.rightRows = 0;
    run.watermarks = { left: { rows: left.rows, lastKey: left.lastKey } };

    await this.setStatus(run, 'blocking');
    const estimate = await this.blocking.estimate(project);

    run.counters.estimatedPairs = estimate.totalEstimatedPairs;
    // Ruling R20: a trigram pass's projection counts exactly-equal keys
    // only, while the pass proposes every pair above a similarity
    // threshold -- a strict superset. When this flag is true
    // `estimatedPairs` is a FLOOR, and any summary showing it must say
    // "at least". Assigned straight from the estimate, never defaulted:
    // quietly defaulting it to `false` would be the failure this flag
    // exists to prevent.
    run.counters.hasInexactPass = estimate.hasInexactPass;
    run.droppedKeys = this.collectDroppedKeys(estimate.perPass);

    if (estimate.refused) {
      throw new BadRequestException(
        `Blocking estimate refuses this run: ${estimate.totalEstimatedPairs} projected candidate pairs is ` +
          `more than twice the configured cap. Add or narrow a blocking pass and estimate again.`,
      );
    }

    await this.setStatus(run, 'scoring');
    for (const pass of project.blockingPasses) {
      await this.scoreOnePass(run, project, pass, estimate.perPass);
    }

    await this.setStatus(run, 'clustering');
    const clustered = await this.clustering.cluster(project, run);
    run.counters.clusters = clustered.clusters;
    run.counters.flaggedClusters = clustered.flagged;

    // A flagged cluster is withheld from the crosswalk by
    // `CrosswalkService` itself; filtering here as well would publish
    // nothing for a run whose clusters are all flagged.
    const published = await this.crosswalk.publish(project, run);
    this.logger.log(`Run ${run.id} published ${published.written} crosswalk rows`);
  }

  /**
   * One scoring pass, with its counters folded into the run.
   *
   * `scorePass` opens its own transaction, because Ruling R21's
   * `SET LOCAL pg_trgm.similarity_threshold` is transaction-scoped and
   * must be in force for both of its statements. Nothing here may wrap it
   * in an outer transaction: that would change which transaction the
   * `SET LOCAL` belongs to, and would hold one transaction open across a
   * whole multi-hour run.
   */
  private async scoreOnePass(
    run: MatchRun,
    project: MatchProject,
    pass: BlockingPass,
    perPass: PassEstimate[],
  ): Promise<void> {
    const droppedKeys = perPass.find((p) => p.pass === pass.name)?.droppedKeys ?? [];
    const result = await this.scoring.scorePass(project, run, pass, droppedKeys);

    // Ruling R24: `autoReject` is "pairs seen minus rows newly inserted",
    // which also catches a pair an earlier pass already stored. It is
    // accumulated faithfully rather than corrected -- separating the two
    // would need a third statement per pass over hundreds of millions of
    // rows. Pairs *seen* by the pass is therefore inserted + autoReject.
    run.counters.candidatePairs += result.inserted + result.autoReject;
    run.counters.autoMatch += result.autoMatch;
    run.counters.grey += result.grey;
    run.counters.autoReject += result.autoReject;

    // Saved per pass, not only at the end: a pass over 10M rows can take
    // many minutes, and a run whose counters only move at the end looks
    // hung.
    await this.persist(run);
  }

  /**
   * Turns the estimate's per-pass exclusion lists into the run's
   * `dropped_keys` record. Passes that dropped nothing are left out
   * entirely -- an empty entry per pass is noise in a record whose whole
   * purpose is to tell an operator which key values were excluded and
   * therefore which matches were never proposed.
   */
  private collectDroppedKeys(perPass: PassEstimate[]): RunDroppedKeys[] {
    return perPass
      .filter((p) => p.droppedKeys.length > 0)
      .map((p) => ({ pass: p.pass, keys: p.droppedKeys }));
  }

  private async setStatus(run: MatchRun, status: MatchRunStatus): Promise<void> {
    run.status = status;
    await this.persist(run);
  }

  /**
   * Writes the terminal state. `duration_ms` is `finishedAt - startedAt`
   * and is set on the failure path exactly as on the success path -- a
   * failed run's duration is the most useful number it has (a run that
   * failed after 90 minutes and one that failed in 2 seconds need very
   * different investigation).
   */
  private async finish(
    run: MatchRun,
    startedAt: Date,
    status: 'completed' | 'failed',
    error: Error | null,
  ): Promise<void> {
    const finishedAt = new Date();
    run.status = status;
    run.finishedAt = finishedAt;
    run.durationMs = finishedAt.getTime() - startedAt.getTime();
    run.errorMessage = error ? error.message : null;
    await this.persist(run);
  }

  /**
   * Saves a **snapshot** of the run rather than the live entity.
   *
   * The pipeline mutates one `run` object across a multi-hour run; saving
   * that object would hand the persistence layer an object that keeps
   * changing while the write is in flight, and would make the run's own
   * save history a series of references to one final state. A shallow copy
   * per save is cheap and means each write is exactly the state that was
   * intended at that point.
   */
  private async persist(run: MatchRun): Promise<void> {
    await this.runRepo.save({ ...run });
  }

  private async loadRun(runId: string, organizationId: string): Promise<MatchRun> {
    const run = await this.runRepo.findOne({ where: { id: runId, organizationId } });
    if (!run) {
      throw new NotFoundException(`Match run ${runId} not found`);
    }
    return run;
  }

  private async loadProject(projectId: string, organizationId: string): Promise<MatchProject> {
    const project = await this.projectRepo.findOne({ where: { id: projectId, organizationId } });
    if (!project) {
      throw new NotFoundException(`Match project ${projectId} not found`);
    }
    return project;
  }

  /**
   * Takes this project's advisory lock, or refuses the run.
   *
   * `pg_try_advisory_lock`, never the blocking `pg_advisory_lock`: a
   * second run must fail immediately with a message naming the reason,
   * not queue behind a job that may take two hours and then start by
   * dropping the workspace table the first run is still reading.
   *
   * The lock is taken on a dedicated `QueryRunner` and *held* by it. A
   * session-level advisory lock belongs to a connection, so taking it on a
   * pooled connection that is then handed back to the pool leaks a lock
   * nobody can release; the runner returned here is the only object that
   * can release it, and `releaseProjectLock` is the only place that does.
   */
  private async acquireProjectLock(projectId: string): Promise<QueryRunner> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    let locked = false;
    try {
      const rows = await runner.query('SELECT pg_try_advisory_lock($1, $2) AS locked', [
        MATCH_RUN_LOCK_CLASS_ID,
        this.projectLockKey(projectId),
      ]);
      locked = rows?.[0]?.locked === true;
    } finally {
      // Either the query failed or the lock was refused: in both cases
      // nothing is held, so the connection goes straight back.
      if (!locked) {
        await runner.release();
      }
    }

    if (!locked) {
      throw new ConflictException(
        `Another run for match project ${projectId} is already running. Runs of one project share a single ` +
          `workspace table that each run rebuilds from scratch, so they cannot overlap — wait for it to finish.`,
      );
    }

    return runner;
  }

  /**
   * Releases the lock and then the connection, in that order, and never
   * throws: an unlock that fails must not mask the outcome of the run
   * itself (which is already recorded on the run row). The connection is
   * released in a `finally` regardless, because a runner left unreleased
   * is a connection permanently missing from the pool.
   */
  private async releaseProjectLock(runner: QueryRunner, projectId: string): Promise<void> {
    try {
      const rows = await runner.query('SELECT pg_advisory_unlock($1, $2) AS unlocked', [
        MATCH_RUN_LOCK_CLASS_ID,
        this.projectLockKey(projectId),
      ]);
      if (rows?.[0]?.unlocked === false) {
        this.logger.warn(`Advisory lock for match project ${projectId} was not held at release time`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to release the advisory lock for match project ${projectId}: ${(error as Error).message}`,
      );
    } finally {
      await runner.release();
    }
  }

  /**
   * A stable 32-bit signed key for a project id, used as the advisory
   * lock's second argument.
   *
   * Hashed in JavaScript (FNV-1a) rather than with PostgreSQL's
   * `hashtext`, which is an undocumented internal function, and passed as
   * a bound parameter so the id never reaches the SQL text. Two projects
   * colliding on this key would serialize against each other
   * unnecessarily, which is a performance cost and never a correctness
   * one; the same project always produces the same key, which is the
   * property the lock depends on.
   */
  private projectLockKey(projectId: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < projectId.length; i++) {
      hash ^= projectId.charCodeAt(i);
      // FNV prime, via shifts so the arithmetic stays in 32 bits.
      hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) | 0;
    }
    return hash | 0;
  }
}
