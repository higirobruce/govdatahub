import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import { MatchDecision, MatchEntity, MatchGoldPair, MatchProject, MatchRun } from '../../database/entities';
import { BlockingService } from './blocking.service';
import { EvalService } from './eval.service';
import { MatchRunService } from './match-run.service';
import { MatchingService } from './matching.service';

/**
 * `MatchingController` mocks `MatchingService` entirely, so none of this
 * service's own logic -- the raw `match_candidates` SQL, what a decision
 * or gold pair actually persists, or organization scoping on the loaders
 * every method shares -- is exercised anywhere else in the suite. These
 * tests close that gap.
 */
describe('MatchingService', () => {
  let service: MatchingService;

  const dataSource = { query: jest.fn() };
  const projectRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x), find: jest.fn(), findOne: jest.fn(), remove: jest.fn() };
  const runRepo = { find: jest.fn(), findOne: jest.fn() };
  const entityRepo = { find: jest.fn() };
  const decisionRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
  const goldRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
  const blocking = { estimate: jest.fn() };
  const matchRun = { start: jest.fn() };
  const evalService = { evaluate: jest.fn(), sweep: jest.fn() };

  const project = {
    id: 'p1',
    organizationId: 'org1',
    status: 'active',
    thresholds: { matchAt: 0.9, rejectAt: 0.55 },
  } as unknown as MatchProject;

  const run = { id: 'r1', organizationId: 'org1', projectId: 'p1' } as unknown as MatchRun;

  beforeEach(async () => {
    jest.clearAllMocks();
    projectRepo.findOne.mockResolvedValue(project);
    runRepo.findOne.mockResolvedValue(run);

    const mod = await Test.createTestingModule({
      providers: [
        MatchingService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(MatchProject), useValue: projectRepo },
        { provide: getRepositoryToken(MatchRun), useValue: runRepo },
        { provide: getRepositoryToken(MatchEntity), useValue: entityRepo },
        { provide: getRepositoryToken(MatchDecision), useValue: decisionRepo },
        { provide: getRepositoryToken(MatchGoldPair), useValue: goldRepo },
        { provide: BlockingService, useValue: blocking },
        { provide: MatchRunService, useValue: matchRun },
        { provide: EvalService, useValue: evalService },
      ],
    }).compile();

    service = mod.get(MatchingService);
  });

  // ---------------------------------------------------------------------
  // Organization scoping on every loader
  // ---------------------------------------------------------------------

  it('throws NotFoundException for a project id from another organization', async () => {
    projectRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findProject('p1', 'other-org')).rejects.toThrow(NotFoundException);
    expect(projectRepo.findOne).toHaveBeenCalledWith({ where: { id: 'p1', organizationId: 'other-org' } });
  });

  it('throws NotFoundException for a run id from another organization', async () => {
    runRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findRun('r1', 'other-org')).rejects.toThrow(NotFoundException);
    expect(runRepo.findOne).toHaveBeenCalledWith({ where: { id: 'r1', organizationId: 'other-org' } });
  });

  it('filters listProjects by organizationId', async () => {
    projectRepo.find.mockResolvedValueOnce([]);
    await service.listProjects('org1');
    expect(projectRepo.find).toHaveBeenCalledWith({
      where: { organizationId: 'org1', status: Not('inactive') },
      order: { createdAt: 'DESC' },
    });
  });

  // ---------------------------------------------------------------------
  // Ruling R31: deleting a project is a soft delete
  //
  // No FK constrains project_id on any child table (runs, entities,
  // decisions, crosswalk, gold pairs), so a hard delete does not fail --
  // it silently orphans every one of them, including match_crosswalk rows
  // that stay live and joinable by other features. It also destroys the
  // project's lawfulBasis/dataOwner, which is the recorded authority for
  // every decision and cluster the retention sweep otherwise keeps
  // forever. DELETE still returns 204; the row survives with
  // status: 'inactive'.
  // ---------------------------------------------------------------------

  it('soft-deletes a project: sets status to inactive and saves, never removes the row (Ruling R31)', async () => {
    const activeProject = { ...project, status: 'active' } as unknown as MatchProject;
    projectRepo.findOne.mockResolvedValueOnce(activeProject);

    await service.deleteProject('p1', 'org1');

    expect(projectRepo.remove).not.toHaveBeenCalled();
    expect(projectRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', status: 'inactive' }));
  });

  it('excludes inactive (soft-deleted) projects from listProjects by default (Ruling R31)', async () => {
    projectRepo.find.mockResolvedValueOnce([]);
    await service.listProjects('org1');
    const [args] = projectRepo.find.mock.calls[0];
    expect(args.where.status).toEqual(Not('inactive'));
  });

  it('still returns a soft-deleted project on a direct fetch by id -- the lawful basis and data owner must stay reachable for an audit (Ruling R31)', async () => {
    const inactiveProject = { ...project, status: 'inactive' } as unknown as MatchProject;
    projectRepo.findOne.mockResolvedValueOnce(inactiveProject);

    const result = await service.findProject('p1', 'org1');

    expect(result.status).toBe('inactive');
    expect(projectRepo.findOne).toHaveBeenCalledWith({ where: { id: 'p1', organizationId: 'org1' } });
  });

  // ---------------------------------------------------------------------
  // Ruling R25: a decision stores the submitted MatchVerdict verbatim
  // ---------------------------------------------------------------------

  it('records a decision with the submitted MatchVerdict, unmodified, and the reviewing user', async () => {
    await service.recordDecision(
      'p1',
      { leftSourceRef: 'left', leftKey: 'a', rightSourceRef: 'right', rightKey: 'b', decision: 'no_match' },
      'org1',
      'u1',
    );
    expect(decisionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        projectId: 'p1',
        leftKey: 'a',
        rightKey: 'b',
        decision: 'no_match',
        userId: 'u1',
      }),
    );
  });

  it('rejects recording a decision against a project outside the caller organization', async () => {
    projectRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.recordDecision(
        'p1',
        { leftSourceRef: 'left', leftKey: 'a', rightSourceRef: 'right', rightKey: 'b', decision: 'match' },
        'other-org',
        'u1',
      ),
    ).rejects.toThrow(NotFoundException);
    expect(decisionRepo.save).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Ruling R28: no source-ref columns on a gold pair
  // ---------------------------------------------------------------------

  it('stores a gold pair with no source-ref fields, labelled by the caller', async () => {
    await service.addGoldPair('p1', { leftKey: 'a', rightKey: 'b', isMatch: true }, 'org1', 'u1');
    const saved = goldRepo.save.mock.calls[0][0];
    expect(saved).toEqual(
      expect.objectContaining({ organizationId: 'org1', projectId: 'p1', leftKey: 'a', rightKey: 'b', isMatch: true, labelledBy: 'u1' }),
    );
    expect(saved).not.toHaveProperty('leftSourceRef');
    expect(saved).not.toHaveProperty('rightSourceRef');
  });

  // ---------------------------------------------------------------------
  // The review queue's raw SQL: parameter count and ordering
  // ---------------------------------------------------------------------

  describe('listCandidates', () => {
    it('queries match_candidates scoped by organization and run, with no decision filter', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).not.toContain('"decision" =');
      expect(params).toEqual(['org1', 'r1', 50, 0]);
      expect(sql).toContain('LIMIT $3 OFFSET $4');
    });

    it('adds the decision filter as its own bound parameter, not string-interpolated', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', { decision: 'grey', limit: 10, offset: 5 } as any);
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('"decision" = $3');
      expect(sql).toContain('LIMIT $4 OFFSET $5');
      expect(params).toEqual(['org1', 'r1', 'grey', 10, 5]);
    });

    it('caps the limit at the documented maximum regardless of what is requested', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', { limit: 999999 } as any);
      const [, params] = dataSource.query.mock.calls[0];
      expect(params[2]).toBe(500);
    });

    it('rejects listing candidates for a run outside the caller organization', async () => {
      runRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.listCandidates('r1', 'other-org', {})).rejects.toThrow(NotFoundException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Evaluation: uses the project's own matchAt, plus the full sweep
  // ---------------------------------------------------------------------

  it('evaluates at the project\'s configured matchAt and returns the sweep alongside it', async () => {
    evalService.evaluate.mockResolvedValueOnce({ truePositives: 1, falsePositives: 0, falseNegatives: 0, precision: 1, recall: 1, f1: 1 });
    evalService.sweep.mockResolvedValueOnce([{ matchAt: 0.5, metrics: {} }]);

    const result = await service.evaluate('r1', 'org1');

    expect(evalService.evaluate).toHaveBeenCalledWith(project, 'r1', 0.9);
    expect(evalService.sweep).toHaveBeenCalledWith(project, 'r1');
    expect(result.metrics.precision).toBe(1);
    expect(result.sweep).toHaveLength(1);
  });

  // ---------------------------------------------------------------------
  // Ruling R30: starting a run never probes the lock -- it delegates
  // ---------------------------------------------------------------------

  it('delegates run start straight to MatchRunService.start with no lock probe of its own', async () => {
    matchRun.start.mockResolvedValueOnce(run);
    const result = await service.startRun('p1', 'org1');
    expect(matchRun.start).toHaveBeenCalledWith('p1', 'org1');
    expect(matchRun.start).toHaveBeenCalledTimes(1);
    expect(result).toBe(run);
  });

  // ---------------------------------------------------------------------
  // Clusters: flagged first
  // ---------------------------------------------------------------------

  it('lists clusters ordered flagged-first', async () => {
    entityRepo.find.mockResolvedValueOnce([]);
    await service.listClusters('r1', 'org1');
    expect(entityRepo.find).toHaveBeenCalledWith({
      where: { runId: 'r1', organizationId: 'org1' },
      order: { flagged: 'DESC', size: 'DESC' },
    });
  });
});
