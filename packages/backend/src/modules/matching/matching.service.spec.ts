import { ConflictException, NotFoundException } from '@nestjs/common';
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
  const runRepo = { find: jest.fn(), findOne: jest.fn(), count: jest.fn() };
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
    lawfulBasis: 'Law No. 058/2021 art. 12',
    dataOwner: 'registrar@example.gov',
    columnAllowlist: ['id', 'surname'],
    thresholds: { matchAt: 0.9, rejectAt: 0.55 },
  } as unknown as MatchProject;

  const run = { id: 'r1', organizationId: 'org1', projectId: 'p1' } as unknown as MatchRun;

  beforeEach(async () => {
    jest.clearAllMocks();
    projectRepo.findOne.mockResolvedValue(project);
    runRepo.findOne.mockResolvedValue(run);
    runRepo.count.mockResolvedValue(0);

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

    it('orders by score with left_key/right_key tiebreakers, so paging is stable across ties (Minor finding)', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).toContain('ORDER BY "score" DESC, "left_key", "right_key"');
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
  // Clusters: flagged first, and paginated (Minor/Important finding 4 --
  // one row per cluster over a national registry is plausibly millions;
  // this was previously an unbounded, unpaginated `find()`).
  // ---------------------------------------------------------------------

  describe('listClusters', () => {
    it('lists clusters ordered flagged-first, defaulting to a bounded page', async () => {
      entityRepo.find.mockResolvedValueOnce([]);
      await service.listClusters('r1', 'org1', {});
      expect(entityRepo.find).toHaveBeenCalledWith({
        where: { runId: 'r1', organizationId: 'org1' },
        order: { flagged: 'DESC', size: 'DESC' },
        take: 50,
        skip: 0,
      });
    });

    it('forwards a requested limit/offset as take/skip', async () => {
      entityRepo.find.mockResolvedValueOnce([]);
      await service.listClusters('r1', 'org1', { limit: 10, offset: 20 } as any);
      expect(entityRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });

    it('caps the limit at the documented maximum regardless of what is requested', async () => {
      entityRepo.find.mockResolvedValueOnce([]);
      await service.listClusters('r1', 'org1', { limit: 999999 } as any);
      expect(entityRepo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    });

    it('rejects listing clusters for a run outside the caller organization', async () => {
      runRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.listClusters('r1', 'other-org', {})).rejects.toThrow(NotFoundException);
      expect(entityRepo.find).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Ruling R32: an inactive project refuses mutation. Reads keep serving
  // it -- an auditor reconstructing a decision must still reach the
  // lawful basis it was made under.
  //
  // Before this ruling, DELETE was cosmetic: MatchRunService.start checks
  // `mode`, never `status`, so a "deleted" project could still
  // materialize fresh citizen data into a workspace table, and PATCH,
  // decisions, gold-pairs and estimate all kept working too.
  // ---------------------------------------------------------------------

  describe('Ruling R32: an inactive project refuses mutation', () => {
    const inactiveProject = { ...project, status: 'inactive' } as unknown as MatchProject;

    it('refuses to start a run on an inactive project', async () => {
      projectRepo.findOne.mockResolvedValueOnce(inactiveProject);
      await expect(service.startRun('p1', 'org1')).rejects.toThrow(ConflictException);
      expect(matchRun.start).not.toHaveBeenCalled();
    });

    it('refuses to record a decision on an inactive project', async () => {
      projectRepo.findOne.mockResolvedValueOnce(inactiveProject);
      await expect(
        service.recordDecision(
          'p1',
          { leftSourceRef: 'left', leftKey: 'a', rightSourceRef: 'right', rightKey: 'b', decision: 'match' },
          'org1',
          'u1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(decisionRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to add a gold pair on an inactive project', async () => {
      projectRepo.findOne.mockResolvedValueOnce(inactiveProject);
      await expect(
        service.addGoldPair('p1', { leftKey: 'a', rightKey: 'b', isMatch: true }, 'org1', 'u1'),
      ).rejects.toThrow(ConflictException);
      expect(goldRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to estimate on an inactive project', async () => {
      projectRepo.findOne.mockResolvedValueOnce(inactiveProject);
      await expect(service.estimate('p1', 'org1')).rejects.toThrow(ConflictException);
      expect(blocking.estimate).not.toHaveBeenCalled();
    });

    it('refuses to update an inactive project', async () => {
      projectRepo.findOne.mockResolvedValueOnce(inactiveProject);
      await expect(service.updateProject('p1', { name: 'x' }, 'org1')).rejects.toThrow(ConflictException);
      expect(projectRepo.save).not.toHaveBeenCalled();
    });

    it('still allows a direct read of an inactive project -- an auditor must still reach the lawful basis it ran under', async () => {
      projectRepo.findOne.mockResolvedValueOnce(inactiveProject);
      const result = await service.findProject('p1', 'org1');
      expect(result.status).toBe('inactive');
    });
  });

  // ---------------------------------------------------------------------
  // Ruling R33: lawfulBasis, dataOwner and columnAllowlist are the
  // recorded authority for data already copied under a project. Free to
  // edit before the project's first run; immutable from the first run
  // onward, because widening columnAllowlist after data has moved would
  // retroactively change the legal boundary the copy was permitted under.
  // ---------------------------------------------------------------------

  describe('Ruling R33: recorded authority is immutable once a project has run', () => {
    const projectWithAuthority = {
      ...project,
      status: 'active',
      lawfulBasis: 'Law No. 058/2021 art. 12',
      dataOwner: 'registrar@example.gov',
      columnAllowlist: ['id', 'surname'],
    } as unknown as MatchProject;

    beforeEach(() => {
      // A fresh shallow copy per call, not the shared `projectWithAuthority`
      // reference itself: `updateProject` assigns straight onto the loaded
      // entity before saving it, so returning the same object on every
      // call would let one test's accepted change (e.g. "before the
      // project has run") silently mutate the fixture every later test in
      // this block reads -- which is exactly the kind of cross-test bleed
      // that would make "resubmitting the same value is a no-op" pass or
      // fail for the wrong reason.
      projectRepo.findOne.mockImplementation(async () => ({ ...projectWithAuthority }));
    });

    it('allows changing lawfulBasis, dataOwner and columnAllowlist before the project has run', async () => {
      runRepo.count.mockResolvedValueOnce(0);
      await service.updateProject(
        'p1',
        {
          lawfulBasis: 'Law No. 099/2022 art. 3',
          dataOwner: 'new-owner@example.gov',
          columnAllowlist: ['id', 'surname', 'dob'],
        } as any,
        'org1',
      );
      expect(projectRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lawfulBasis: 'Law No. 099/2022 art. 3',
          dataOwner: 'new-owner@example.gov',
          columnAllowlist: ['id', 'surname', 'dob'],
        }),
      );
    });

    it('refuses a lawfulBasis change once the project has run', async () => {
      runRepo.count.mockResolvedValueOnce(1);
      await expect(
        service.updateProject('p1', { lawfulBasis: 'a different basis' } as any, 'org1'),
      ).rejects.toThrow(ConflictException);
      expect(projectRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a dataOwner change once the project has run', async () => {
      runRepo.count.mockResolvedValueOnce(1);
      await expect(
        service.updateProject('p1', { dataOwner: 'someone-else@example.gov' } as any, 'org1'),
      ).rejects.toThrow(ConflictException);
      expect(projectRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a columnAllowlist widening once the project has run', async () => {
      runRepo.count.mockResolvedValueOnce(1);
      await expect(
        service.updateProject('p1', { columnAllowlist: ['id', 'surname', 'ssn'] } as any, 'org1'),
      ).rejects.toThrow(ConflictException);
      expect(projectRepo.save).not.toHaveBeenCalled();
    });

    it('treats resubmitting the same columnAllowlist in a different order as a no-op, not a change, even after a run', async () => {
      // No `runRepo.count.mockResolvedValueOnce` here, deliberately: since
      // this is not treated as a change, `count` must never be called at
      // all -- asserted explicitly below, and priming an unconsumed
      // once-value would silently leak into a later test's call instead.
      await service.updateProject('p1', { columnAllowlist: ['surname', 'id'] } as any, 'org1');
      expect(runRepo.count).not.toHaveBeenCalled();
      expect(projectRepo.save).toHaveBeenCalled();
    });

    it('treats resubmitting the identical lawfulBasis and dataOwner as a no-op, not a change, even after a run', async () => {
      // Same reasoning as above: no priming, and assert `count` was never
      // called, rather than leaving an unconsumed once-value queued.
      await service.updateProject(
        'p1',
        { lawfulBasis: projectWithAuthority.lawfulBasis, dataOwner: projectWithAuthority.dataOwner } as any,
        'org1',
      );
      expect(runRepo.count).not.toHaveBeenCalled();
      expect(projectRepo.save).toHaveBeenCalled();
    });

    it('still allows changing unrelated fields (e.g. retentionDays) after the project has run', async () => {
      await service.updateProject('p1', { retentionDays: 60 } as any, 'org1');
      expect(projectRepo.save).toHaveBeenCalledWith(expect.objectContaining({ retentionDays: 60 }));
    });

    it('does not query run count at all when the patch touches none of the three protected fields', async () => {
      await service.updateProject('p1', { retentionDays: 45 } as any, 'org1');
      expect(runRepo.count).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Finding 5: createProject/updateProject need a real behaviour test,
  // not just controller-level wiring against a jest mock of this service.
  // ---------------------------------------------------------------------

  describe('createProject persistence', () => {
    it('persists lawfulBasis, dataOwner, columnAllowlist and organizationId, and marks the project active', async () => {
      const dto = {
        name: 'Citizens dedupe',
        description: 'Quarterly household registry cleanup',
        mode: 'dedupe',
        leftSource: { kind: 'connection', connectionId: 'c1', schemaName: 'public', tableName: 'citizens', primaryKey: 'id' },
        fieldMap: [{ left: 'surname', right: 'surname', role: 'person_name', weight: 1, comparator: 'trgm' }],
        blockingPasses: [{ name: 'name_dob', kind: 'equi', keyExpr: 'surname' }],
        thresholds: { matchAt: 0.9, rejectAt: 0.55 },
        columnAllowlist: ['id', 'surname'],
        lawfulBasis: 'Law No. 058/2021 art. 12',
        dataOwner: 'registrar@example.gov',
        retentionDays: 30,
      } as any;

      await service.createProject(dto, 'org1');

      expect(projectRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org1',
          lawfulBasis: 'Law No. 058/2021 art. 12',
          dataOwner: 'registrar@example.gov',
          columnAllowlist: ['id', 'surname'],
          status: 'active',
          mode: 'dedupe',
          thresholds: { matchAt: 0.9, rejectAt: 0.55 },
          retentionDays: 30,
        }),
      );
    });
  });

  describe('updateProject field assignment', () => {
    const fullPatch = {
      name: 'Renamed',
      description: 'A new description',
      mode: 'link',
      leftSource: { kind: 'staged', stagedDataId: 's1', primaryKey: 'id' },
      rightSource: { kind: 'connection', connectionId: 'c2', primaryKey: 'id' },
      fieldMap: [{ left: 'a', right: 'a', role: 'text', weight: 1, comparator: 'exact' }],
      blockingPasses: [{ name: 'p2', kind: 'trigram', keyExpr: 'a', threshold: 0.5 }],
      thresholds: { matchAt: 0.8, rejectAt: 0.4 },
      columnAllowlist: ['a', 'b'],
      lawfulBasis: 'a new basis',
      dataOwner: 'new-owner@example.gov',
      retentionDays: 90,
    } as any;

    it('applies every field present in the patch onto the entity -- programmatically, over every key in the patch, so an omitted `if (dto.x !== undefined)` line cannot silently drop a field without failing this test', async () => {
      await service.updateProject('p1', fullPatch, 'org1');
      const saved = projectRepo.save.mock.calls[0][0];
      for (const [key, value] of Object.entries(fullPatch)) {
        expect(saved[key]).toEqual(value);
      }
    });

    it('leaves fields untouched when they are absent from the patch', async () => {
      const untouchedProject = {
        ...project,
        name: 'Original name',
        description: 'Original description',
        retentionDays: 30,
      } as unknown as MatchProject;
      projectRepo.findOne.mockResolvedValueOnce(untouchedProject);

      await service.updateProject('p1', { name: 'Only the name changes' } as any, 'org1');

      const saved = projectRepo.save.mock.calls[0][0];
      expect(saved.name).toBe('Only the name changes');
      expect(saved.description).toBe('Original description');
      expect(saved.retentionDays).toBe(30);
    });
  });
});
