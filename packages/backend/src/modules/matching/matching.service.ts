import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MatchDecision, MatchEntity, MatchGoldPair, MatchProject, MatchRun } from '../../database/entities';
import type { CandidateDecision } from '../../database/entities';
import { BlockingEstimate, BlockingService } from './blocking.service';
import { MaterializeService } from './materialize.service';
import { EvalMetrics, EvalService, SweepPoint } from './eval.service';
import { MatchRunService } from './match-run.service';
import {
  AddGoldPairDto,
  CreateMatchProjectDto,
  GetCandidatesQueryDto,
  GetClustersQueryDto,
  RetractDecisionQueryDto,
  SubmitDecisionDto,
  UpdateMatchProjectDto,
} from './dto';

/**
 * One row of `match_candidates` as read for the review queue. There is no
 * entity for this table (see `ScoringService`/`EvalService`, which read it
 * the same raw-SQL way); the API surface reads it identically here.
 *
 * Ruling R39: `features` (already stored by `ScoringService.featuresExpr`)
 * and `left_record`/`right_record` (the two source rows, read live off the
 * run's materialized workspace table) are included so a reviewer sees more
 * than two opaque keys and a number. Both records are `null` when the
 * workspace table has been dropped -- see `listCandidates` below.
 */
export interface CandidateRow {
  left_key: string;
  right_key: string;
  score: number;
  decision: CandidateDecision;
  blocking_pass: string;
  features: Record<string, number>;
  left_record: Record<string, unknown> | null;
  right_record: Record<string, unknown> | null;
}

export interface RunEvaluation {
  metrics: EvalMetrics;
  sweep: SweepPoint[];
}

const DEFAULT_CANDIDATES_LIMIT = 50;
const MAX_CANDIDATES_LIMIT = 500;
const DEFAULT_CLUSTERS_LIMIT = 50;
const MAX_CLUSTERS_LIMIT = 500;

/**
 * `MatchingController`'s only collaborator. This is where organization
 * scoping is actually enforced -- every method takes `organizationId` and
 * every lookup filters by it -- because the controller only ever forwards
 * `user.organizationId`; it never re-derives it, and nothing behind this
 * service re-checks it either.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MatchProject) private readonly projectRepo: Repository<MatchProject>,
    @InjectRepository(MatchRun) private readonly runRepo: Repository<MatchRun>,
    @InjectRepository(MatchEntity) private readonly entityRepo: Repository<MatchEntity>,
    @InjectRepository(MatchDecision) private readonly decisionRepo: Repository<MatchDecision>,
    @InjectRepository(MatchGoldPair) private readonly goldRepo: Repository<MatchGoldPair>,
    private readonly blocking: BlockingService,
    private readonly matchRun: MatchRunService,
    private readonly evalService: EvalService,
    private readonly materialize: MaterializeService,
  ) {}

  // ─── Projects ────────────────────────────────────────────────────────

  async createProject(dto: CreateMatchProjectDto, organizationId: string): Promise<MatchProject> {
    const project = this.projectRepo.create({
      id: uuidv4(),
      organizationId,
      name: dto.name,
      description: dto.description ?? null,
      mode: dto.mode,
      leftSource: dto.leftSource,
      rightSource: dto.rightSource ?? null,
      fieldMap: dto.fieldMap ?? [],
      blockingPasses: dto.blockingPasses ?? [],
      thresholds: dto.thresholds,
      columnAllowlist: dto.columnAllowlist,
      lawfulBasis: dto.lawfulBasis,
      dataOwner: dto.dataOwner,
      retentionDays: dto.retentionDays,
      status: 'active',
    });
    return this.projectRepo.save(project);
  }

  /**
   * Excludes soft-deleted (`status: 'inactive'`) projects -- see
   * `deleteProject` and Ruling R31. A direct fetch by id
   * (`findProject`) is deliberately not filtered the same way: an
   * auditor reconstructing why a decision was made must still be able to
   * reach the project's `lawfulBasis`/`dataOwner` by id.
   */
  async listProjects(organizationId: string): Promise<MatchProject[]> {
    return this.projectRepo.find({
      where: { organizationId, status: Not('inactive') },
      order: { createdAt: 'DESC' },
    });
  }

  async findProject(id: string, organizationId: string): Promise<MatchProject> {
    return this.loadProject(id, organizationId);
  }

  /**
   * Ruling R32: refuses an inactive (soft-deleted) project outright, via
   * `loadActiveProject`.
   *
   * Ruling R33: `lawfulBasis`, `dataOwner` and `columnAllowlist` are the
   * recorded authority for data already copied under this project.
   * Before the project's first run they are ordinary configuration and
   * freely editable; from the first run onward a *change* to any of them
   * is refused with a 409 -- widening `columnAllowlist` after data has
   * moved would retroactively change the legal boundary the copy was
   * permitted under, with nothing recording that the boundary moved.
   * Resubmitting the value already stored (including `columnAllowlist` in
   * a different order) is not a change and is allowed even after a run.
   */
  async updateProject(id: string, dto: UpdateMatchProjectDto, organizationId: string): Promise<MatchProject> {
    const project = await this.loadActiveProject(id, organizationId);

    const changesLawfulBasis = dto.lawfulBasis !== undefined && dto.lawfulBasis !== project.lawfulBasis;
    const changesDataOwner = dto.dataOwner !== undefined && dto.dataOwner !== project.dataOwner;
    const changesColumnAllowlist =
      dto.columnAllowlist !== undefined && !this.sameColumnSet(dto.columnAllowlist, project.columnAllowlist);

    if (changesLawfulBasis || changesDataOwner || changesColumnAllowlist) {
      const runCount = await this.runRepo.count({ where: { projectId: id, organizationId } });
      if (runCount > 0) {
        throw new ConflictException(
          `Match project ${id} has at least one run: lawfulBasis, dataOwner and columnAllowlist are the ` +
            `recorded authority for data already copied under this project, and are immutable from its ` +
            `first run onward (Ruling R33) -- create a new project instead of changing them.`,
        );
      }
    }

    if (dto.name !== undefined) project.name = dto.name;
    if (dto.description !== undefined) project.description = dto.description;
    if (dto.mode !== undefined) project.mode = dto.mode;
    if (dto.leftSource !== undefined) project.leftSource = dto.leftSource;
    if (dto.rightSource !== undefined) project.rightSource = dto.rightSource;
    if (dto.fieldMap !== undefined) project.fieldMap = dto.fieldMap;
    if (dto.blockingPasses !== undefined) project.blockingPasses = dto.blockingPasses;
    if (dto.thresholds !== undefined) project.thresholds = dto.thresholds;
    if (dto.columnAllowlist !== undefined) project.columnAllowlist = dto.columnAllowlist;
    if (dto.lawfulBasis !== undefined) project.lawfulBasis = dto.lawfulBasis;
    if (dto.dataOwner !== undefined) project.dataOwner = dto.dataOwner;
    if (dto.retentionDays !== undefined) project.retentionDays = dto.retentionDays;
    return this.projectRepo.save(project);
  }

  /**
   * Ruling R31: a soft delete. No foreign key constrains `project_id` on
   * any child table (runs, entities, decisions, crosswalk, gold pairs),
   * so a hard delete here would not fail -- it would silently orphan
   * every one of them, including `match_crosswalk` rows that other
   * features join against and that would stay live and joinable while
   * pointing at a project that no longer exists. It would also destroy
   * the project's `lawfulBasis`/`dataOwner` -- the recorded authority for
   * decisions and clusters the retention sweep otherwise keeps forever.
   * The HTTP contract is unchanged: this still returns 204.
   */
  async deleteProject(id: string, organizationId: string): Promise<void> {
    const project = await this.loadProject(id, organizationId);
    project.status = 'inactive';
    await this.projectRepo.save(project);
  }

  /** Ruling R32: an inactive project refuses estimation, not just runs. */
  async estimate(id: string, organizationId: string): Promise<BlockingEstimate> {
    const project = await this.loadActiveProject(id, organizationId);
    await this.assertWorkspaceMaterialized(project);
    return this.blocking.estimate(project);
  }

  /**
   * Ruling R36: `BlockingService.estimate` reads
   * `MaterializeService.workspaceTable(project.id, 'left')`, a real
   * PostgreSQL table that is only ever created by a run's own materialize
   * step (`MatchRunService.start`, which materializes before it estimates
   * -- see `match-run.service.ts`). This method deliberately does NOT
   * materialize on demand to make a first-time estimate succeed:
   * materializing copies citizen or business data into DataGate, and the
   * wizard records the lawful basis and data owner in its last step, after
   * blocking. Copying data early to answer "how big would this be" would
   * invert the order this feature is built around -- authority recorded
   * first, data copied second -- and would leave copied personal data
   * behind if the user abandoned the wizard before finishing it.
   *
   * So: before a project's first run, the workspace table genuinely does
   * not exist, and that must surface as a clear, actionable error rather
   * than a raw `relation "matching.p_..." does not exist` -- an internal
   * error otherwise leaking straight to an HTTP caller. `to_regclass`
   * checks existence directly instead of catching and pattern-matching the
   * driver's error text, which would silently stop working the moment a
   * PostgreSQL upgrade or driver change reworded the message.
   */
  private async assertWorkspaceMaterialized(project: MatchProject): Promise<void> {
    const table = this.materialize.workspaceTable(project.id, 'left');
    const rows: { reg: string | null }[] = await this.dataSource.query('SELECT to_regclass($1) AS reg', [table]);
    if (!rows[0] || rows[0].reg === null) {
      throw new ConflictException(
        `Match project ${project.id} has not run yet -- a blocking estimate reads the workspace copy a run's ` +
          `own materialize step creates, and that copy does not exist until this project completes its first ` +
          `run. "Create and run" is safe without a preview: the run computes this estimate internally, before ` +
          `scoring, and refuses automatically if the projected pairs exceed twice the configured cap.`,
      );
    }
  }

  // ─── Runs ────────────────────────────────────────────────────────────

  /**
   * Delegates straight to `MatchRunService.start`, with no lock probe of
   * our own (Ruling R30). A second concurrent run is not rejected with a
   * 409 here -- `start` cannot know the project's advisory lock is free
   * without holding it, and holding it past the response is exactly what
   * `execute`'s background pipeline does. A racy probe here would only
   * trade a correct-but-late failure (the second run's row ending
   * `failed` with the lock's own error message) for a sometimes-wrong
   * early one.
   */
  async startRun(id: string, organizationId: string): Promise<MatchRun> {
    // Ruling R32: `MatchRunService.start` checks `mode`, never `status` --
    // without this, a "deleted" project could still materialize fresh
    // citizen data into a workspace table. Guarded here, at the HTTP
    // surface's own service, rather than inside `MatchRunService`, which
    // belongs to a different task and whose lock/lifecycle design this
    // change must not touch.
    await this.loadActiveProject(id, organizationId);
    return this.matchRun.start(id, organizationId);
  }

  async listRuns(id: string, organizationId: string): Promise<MatchRun[]> {
    await this.loadProject(id, organizationId);
    return this.runRepo.find({ where: { projectId: id, organizationId }, order: { startedAt: 'DESC' } });
  }

  async findRun(runId: string, organizationId: string): Promise<MatchRun> {
    return this.loadRun(runId, organizationId);
  }

  // ─── Review queue ────────────────────────────────────────────────────

  /**
   * Ruling R39: as written before this change, the review queue surfaced
   * only `left_key, right_key, score, decision, blocking_pass` -- two
   * opaque keys and a number, nothing a human could actually certify a
   * match against. This now also selects `features` (already stored on
   * every row by `ScoringService`, simply not selected before) and joins
   * the run's project's workspace table to attach the two source rows as
   * `left_record`/`right_record`.
   *
   * Phase 1 is dedupe-only, so both sides of a candidate pair are keys
   * into the *same* workspace table -- `ScoringService.buildScoringSql`
   * joins it the same way, twice, for the same reason (see
   * `scoring.service.ts:205`).
   *
   * The workspace table is not guaranteed to still exist: the retention
   * sweep (`matching-cleanup.service.ts`) drops it after
   * `project.retentionDays`. `to_regclass` checks that directly, the same
   * way `assertWorkspaceMaterialized` above does for the estimate path,
   * rather than attempting the join and pattern-matching a "relation does
   * not exist" error. When the table is gone, both record columns come
   * back `null` and the candidate rows are still returned in full --
   * never thrown, and the workspace is never re-materialized just to
   * answer a read.
   */
  async listCandidates(
    runId: string,
    organizationId: string,
    query: GetCandidatesQueryDto,
  ): Promise<CandidateRow[]> {
    const run = await this.loadRun(runId, organizationId);
    const project = await this.loadProject(run.projectId, organizationId);

    const limit = Math.min(query.limit ?? DEFAULT_CANDIDATES_LIMIT, MAX_CANDIDATES_LIMIT);
    const offset = query.offset ?? 0;

    const table = this.materialize.workspaceTable(project.id, 'left');
    const regRows: { reg: string | null }[] = await this.dataSource.query('SELECT to_regclass($1) AS reg', [table]);
    const workspaceExists = !!regRows[0] && regRows[0].reg !== null;

    const params: unknown[] = [organizationId, runId];
    let decisionClause = '';
    if (query.decision) {
      params.push(query.decision);
      decisionClause = ` AND c."decision" = $${params.length}`;
    }
    params.push(limit, offset);

    // A LEFT JOIN, deliberately: a candidate whose workspace row is
    // missing (a race with the retention sweep, or a corrupt row) must
    // still appear in the queue as a null-record pair, not silently
    // vanish from it. `c`/`l`/`r` are fixed aliases, never user input;
    // match_candidates' own columns are qualified by `c.` throughout so
    // they can never collide with an allow-listed source column of the
    // same name (e.g. a registry column literally called "score").
    const recordColumns = workspaceExists
      ? `, to_jsonb(l.*) AS "left_record", to_jsonb(r.*) AS "right_record"`
      : `, NULL::jsonb AS "left_record", NULL::jsonb AS "right_record"`;
    const joinClause = workspaceExists
      ? ` LEFT JOIN ${table} l ON l."src_key" = c."left_key" LEFT JOIN ${table} r ON r."src_key" = c."right_key"`
      : '';

    // Ties on `score` are common (many pairs land on the same weighted
    // sum), and ORDER BY + LIMIT/OFFSET over an untied column is not a
    // stable pagination order: a steward paging the review queue could
    // see the same pair twice and never see another one at all. The
    // tiebreaker columns are fixed identifiers, never user input.
    return this.dataSource.query(
      `SELECT c."left_key", c."right_key", c."score", c."decision", c."blocking_pass", c."features"${recordColumns} ` +
        `FROM "match_candidates" c${joinClause} ` +
        `WHERE c."organization_id" = $1 AND c."run_id" = $2${decisionClause} ` +
        `ORDER BY c."score" DESC, c."left_key", c."right_key" LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
  }

  // ─── Decisions ───────────────────────────────────────────────────────

  /**
   * `dto.decision` is a `MatchVerdict` (`'match' | 'no_match'`), enforced
   * by `SubmitDecisionDto`'s `@IsIn` -- see Ruling R25. Stored on
   * `match_decisions.decision` exactly as submitted, never remapped to a
   * `CandidateDecision`; that translation happens downstream, once, in
   * `ScoringService`.
   *
   * Ruling R43 (part 1): an upsert, not a plain insert. Before this
   * change, a second submission for the same pair -- reloading the queue
   * and re-answering it, or the review queue's own undo re-asserting a
   * verdict -- raised a Postgres unique-violation on
   * `uq_match_decisions_pair` and surfaced as an unhandled 500. A steward
   * reaching the same pair twice is *correcting* an answer, and a
   * correction must not be a constraint violation. `ON CONFLICT ON
   * CONSTRAINT "uq_match_decisions_pair" DO UPDATE` replaces exactly
   * `decision`, `user_id` and the timestamp -- not `id`, and not
   * `prior_score`/`prior_llm_verdict` -- so a correction updates the one
   * row in place rather than either failing or silently changing the
   * row's identity. `created_at` moving to the moment of the correction
   * is what `ScoringService`'s `decisions` CTE relies on when it resolves
   * multiple rows for a pair by recency (`ORDER BY created_at DESC, id
   * DESC`).
   *
   * This bypasses `decisionRepo` (a plain TypeORM `save()` cannot express
   * `ON CONFLICT ... DO UPDATE`) in favour of the same raw-SQL pattern the
   * rest of this service already uses for anything the query builder
   * cannot say directly.
   */
  async recordDecision(
    projectId: string,
    dto: SubmitDecisionDto,
    organizationId: string,
    userId: string,
  ): Promise<MatchDecision> {
    // Ruling R32: an inactive project refuses new decisions.
    await this.loadActiveProject(projectId, organizationId);
    const rows = await this.dataSource.query(
      `INSERT INTO "match_decisions" ` +
        `("id", "organization_id", "project_id", "left_source_ref", "left_key", "right_source_ref", "right_key", ` +
        `"decision", "user_id", "prior_score", "prior_llm_verdict", "created_at") ` +
        `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, now()) ` +
        `ON CONFLICT ON CONSTRAINT "uq_match_decisions_pair" ` +
        `DO UPDATE SET "decision" = EXCLUDED."decision", "user_id" = EXCLUDED."user_id", "created_at" = now() ` +
        `RETURNING *`,
      [uuidv4(), organizationId, projectId, dto.leftSourceRef, dto.leftKey, dto.rightSourceRef, dto.rightKey, dto.decision, userId],
    );
    return this.mapDecisionRow(rows[0]);
  }

  /**
   * Ruling R43 (part 2): undo retracts a verdict -- it does not assert
   * the opposite. `ScoringService`'s `decisions` CTE honours a stored
   * verdict regardless of score (Ruling R23) and translates `'no_match'`
   * to `'rejected'` (Ruling R25): a verdict is a durable override that
   * suppresses or confirms a pair in every future run, not a note. A
   * mis-keyed `m` "undone" by submitting `'no_match'` would leave a
   * permanent, steward-attributed record that two records are *not* the
   * same entity -- the one thing this screen must never manufacture.
   * Deleting the decision row is the actual inverse: the pair simply
   * returns to whatever the score alone would have made it (most often
   * the grey band it came from) on the run's next scoring pass.
   *
   * Matches the pair in either key order, the same way
   * `ScoringService.scoreStatement`'s `decisions` CTE already normalizes
   * with `least`/`greatest` when it *reads* a decision (see
   * `scoring.service.ts` around its `k1`/`k2` projection) -- a verdict
   * recorded as `(b, a)` must still be retractable from a pair displayed
   * as `(a, b)`. Deliberately does not filter on source ref either, for
   * the same reason that CTE does not: it folds every decision row for a
   * key pair together regardless of source-ref values, so retract must
   * be able to remove all of them, not just the one matching today's
   * exact ref values.
   *
   * Retracting a pair with no decision row is not an error -- it is the
   * state the caller asked for -- so this never inspects or reports how
   * many rows were actually deleted.
   */
  async retractDecision(
    projectId: string,
    dto: RetractDecisionQueryDto,
    organizationId: string,
  ): Promise<void> {
    // Ruling R32: an inactive project refuses retractions too.
    await this.loadActiveProject(projectId, organizationId);
    await this.dataSource.query(
      `DELETE FROM "match_decisions" ` +
        `WHERE "organization_id" = $1 AND "project_id" = $2 ` +
        `AND least("left_key", "right_key") = least($3, $4) ` +
        `AND greatest("left_key", "right_key") = greatest($3, $4)`,
      [organizationId, projectId, dto.leftKey, dto.rightKey],
    );
  }

  /** Raw-row shape of `RETURNING *` on `match_decisions`, mapped to `MatchDecision`'s camelCase fields. */
  private mapDecisionRow(row: Record<string, unknown>): MatchDecision {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      leftSourceRef: row.left_source_ref,
      leftKey: row.left_key,
      rightSourceRef: row.right_source_ref,
      rightKey: row.right_key,
      decision: row.decision,
      userId: row.user_id,
      priorScore: row.prior_score,
      priorLlmVerdict: row.prior_llm_verdict,
      createdAt: row.created_at,
    } as MatchDecision;
  }

  // ─── Clusters ────────────────────────────────────────────────────────

  /**
   * One row per cluster over a national registry is plausibly millions;
   * capped and paginated the same way `listCandidates` is, rather than
   * serialising every cluster for a run in one response.
   */
  async listClusters(
    runId: string,
    organizationId: string,
    query: GetClustersQueryDto,
  ): Promise<MatchEntity[]> {
    await this.loadRun(runId, organizationId);
    const take = Math.min(query.limit ?? DEFAULT_CLUSTERS_LIMIT, MAX_CLUSTERS_LIMIT);
    const skip = query.offset ?? 0;
    // Ties on `flagged`/`size` are common (many clusters share a size),
    // and ORDER BY + take/skip over an untied column is not a stable
    // pagination order: a steward paging the clusters view could see the
    // same cluster twice and never see another one at all. `id` is a
    // unique tiebreaker, same precedent as `listCandidates`'s `left_key,
    // right_key`.
    return this.entityRepo.find({
      where: { runId, organizationId },
      order: { flagged: 'DESC', size: 'DESC', id: 'ASC' },
      take,
      skip,
    });
  }

  // ─── Evaluation ──────────────────────────────────────────────────────

  async evaluate(runId: string, organizationId: string): Promise<RunEvaluation> {
    const run = await this.loadRun(runId, organizationId);
    const project = await this.loadProject(run.projectId, organizationId);
    const [metrics, sweep] = await Promise.all([
      this.evalService.evaluate(project, runId, project.thresholds.matchAt),
      this.evalService.sweep(project, runId),
    ]);
    return { metrics, sweep };
  }

  // ─── Gold pairs ──────────────────────────────────────────────────────

  /** Ruling R28: no source-ref columns on `match_gold_pairs` -- see `AddGoldPairDto`. */
  async addGoldPair(
    projectId: string,
    dto: AddGoldPairDto,
    organizationId: string,
    userId: string,
  ): Promise<MatchGoldPair> {
    // Ruling R32: an inactive project refuses new gold-pair labels.
    await this.loadActiveProject(projectId, organizationId);
    const pair = this.goldRepo.create({
      id: uuidv4(),
      organizationId,
      projectId,
      leftKey: dto.leftKey,
      rightKey: dto.rightKey,
      isMatch: dto.isMatch,
      labelledBy: userId,
    });
    return this.goldRepo.save(pair);
  }

  // ─── Shared loaders ──────────────────────────────────────────────────

  private async loadProject(id: string, organizationId: string): Promise<MatchProject> {
    const project = await this.projectRepo.findOne({ where: { id, organizationId } });
    if (!project) {
      throw new NotFoundException(`Match project ${id} not found`);
    }
    return project;
  }

  /**
   * Ruling R32: every *mutating* method calls this instead of
   * `loadProject`. A soft-deleted (`status: 'inactive'`) project must
   * refuse further mutation -- otherwise deletion is cosmetic: the run
   * orchestrator checks `mode`, never `status`, so without this guard a
   * "deleted" project could still materialize fresh citizen data into a
   * workspace table. Every *read* method keeps calling `loadProject`
   * directly and is deliberately not routed through here: an auditor
   * reconstructing why a decision was made must still be able to reach
   * an inactive project's `lawfulBasis`/`dataOwner`.
   */
  private async loadActiveProject(id: string, organizationId: string): Promise<MatchProject> {
    const project = await this.loadProject(id, organizationId);
    if (project.status === 'inactive') {
      throw new ConflictException(
        `Match project ${id} has been deleted (status: inactive) -- create a new project instead of ` +
          `mutating a deleted one.`,
      );
    }
    return project;
  }

  /**
   * Order-insensitive set equality for `columnAllowlist`. Reordering the
   * same set of columns is not a change to the legal boundary of what
   * gets copied (Ruling R33), so it must not trip the post-run
   * immutability guard the way an actual widening or narrowing does.
   */
  private sameColumnSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((value, index) => value === sortedB[index]);
  }

  private async loadRun(runId: string, organizationId: string): Promise<MatchRun> {
    const run = await this.runRepo.findOne({ where: { id: runId, organizationId } });
    if (!run) {
      throw new NotFoundException(`Match run ${runId} not found`);
    }
    return run;
  }
}
