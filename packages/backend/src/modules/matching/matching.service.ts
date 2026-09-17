import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MatchDecision, MatchEntity, MatchGoldPair, MatchProject, MatchRun } from '../../database/entities';
import type { CandidateDecision } from '../../database/entities';
import { BlockingEstimate, BlockingService } from './blocking.service';
import { EvalMetrics, EvalService, SweepPoint } from './eval.service';
import { MatchRunService } from './match-run.service';
import {
  AddGoldPairDto,
  CreateMatchProjectDto,
  GetCandidatesQueryDto,
  SubmitDecisionDto,
  UpdateMatchProjectDto,
} from './dto';

/**
 * One row of `match_candidates` as read for the review queue. There is no
 * entity for this table (see `ScoringService`/`EvalService`, which read it
 * the same raw-SQL way); the API surface reads it identically here.
 */
export interface CandidateRow {
  left_key: string;
  right_key: string;
  score: number;
  decision: CandidateDecision;
  blocking_pass: string;
}

export interface RunEvaluation {
  metrics: EvalMetrics;
  sweep: SweepPoint[];
}

const DEFAULT_CANDIDATES_LIMIT = 50;
const MAX_CANDIDATES_LIMIT = 500;

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

  async listProjects(organizationId: string): Promise<MatchProject[]> {
    return this.projectRepo.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
  }

  async findProject(id: string, organizationId: string): Promise<MatchProject> {
    return this.loadProject(id, organizationId);
  }

  async updateProject(id: string, dto: UpdateMatchProjectDto, organizationId: string): Promise<MatchProject> {
    const project = await this.loadProject(id, organizationId);
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

  async deleteProject(id: string, organizationId: string): Promise<void> {
    const project = await this.loadProject(id, organizationId);
    await this.projectRepo.remove(project);
  }

  async estimate(id: string, organizationId: string): Promise<BlockingEstimate> {
    const project = await this.loadProject(id, organizationId);
    return this.blocking.estimate(project);
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

  async listCandidates(
    runId: string,
    organizationId: string,
    query: GetCandidatesQueryDto,
  ): Promise<CandidateRow[]> {
    await this.loadRun(runId, organizationId);

    const limit = Math.min(query.limit ?? DEFAULT_CANDIDATES_LIMIT, MAX_CANDIDATES_LIMIT);
    const offset = query.offset ?? 0;

    const params: unknown[] = [organizationId, runId];
    let decisionClause = '';
    if (query.decision) {
      params.push(query.decision);
      decisionClause = ` AND "decision" = $${params.length}`;
    }
    params.push(limit, offset);

    return this.dataSource.query(
      `SELECT "left_key", "right_key", "score", "decision", "blocking_pass" FROM "match_candidates" ` +
        `WHERE "organization_id" = $1 AND "run_id" = $2${decisionClause} ` +
        `ORDER BY "score" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
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
   */
  async recordDecision(
    projectId: string,
    dto: SubmitDecisionDto,
    organizationId: string,
    userId: string,
  ): Promise<MatchDecision> {
    await this.loadProject(projectId, organizationId);
    const decision = this.decisionRepo.create({
      id: uuidv4(),
      organizationId,
      projectId,
      leftSourceRef: dto.leftSourceRef,
      leftKey: dto.leftKey,
      rightSourceRef: dto.rightSourceRef,
      rightKey: dto.rightKey,
      decision: dto.decision,
      userId,
      priorScore: null,
      priorLlmVerdict: null,
    });
    return this.decisionRepo.save(decision);
  }

  // ─── Clusters ────────────────────────────────────────────────────────

  async listClusters(runId: string, organizationId: string): Promise<MatchEntity[]> {
    await this.loadRun(runId, organizationId);
    return this.entityRepo.find({
      where: { runId, organizationId },
      order: { flagged: 'DESC', size: 'DESC' },
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
    await this.loadProject(projectId, organizationId);
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

  private async loadRun(runId: string, organizationId: string): Promise<MatchRun> {
    const run = await this.runRepo.findOne({ where: { id: runId, organizationId } });
    if (!run) {
      throw new NotFoundException(`Match run ${runId} not found`);
    }
    return run;
  }
}
