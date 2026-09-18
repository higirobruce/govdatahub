import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Not } from 'typeorm';
import { MatchDecision, MatchEntity, MatchGoldPair, MatchProject, MatchRun } from '../../database/entities';
import { BlockingService } from './blocking.service';
import { EvalService } from './eval.service';
import { MatchRunService } from './match-run.service';
import { MaterializeService } from './materialize.service';
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
  const materialize = { workspaceTable: jest.fn((projectId: string, side: string) => `matching.p_${projectId}_${side}`) };

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
        { provide: MaterializeService, useValue: materialize },
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
  // Ruling R43 (part 1): recording a decision is an upsert, not a plain
  // insert -- a second submission for the same pair replaces it in
  // place rather than throwing a unique-violation.
  // ---------------------------------------------------------------------

  it('records a decision with the submitted MatchVerdict, unmodified, and the reviewing user', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 'd1',
        organization_id: 'org1',
        project_id: 'p1',
        left_source_ref: 'left',
        left_key: 'a',
        right_source_ref: 'right',
        right_key: 'b',
        decision: 'no_match',
        user_id: 'u1',
        prior_score: null,
        prior_llm_verdict: null,
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const result = await service.recordDecision(
      'p1',
      { leftSourceRef: 'left', leftKey: 'a', rightSourceRef: 'right', rightKey: 'b', decision: 'no_match' },
      'org1',
      'u1',
    );

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO "match_decisions"');
    expect(params).toEqual([expect.any(String), 'org1', 'p1', 'left', 'a', 'right', 'b', 'no_match', 'u1']);
    expect(result).toEqual(
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

  it('upserts on the pair\'s unique constraint, replacing decision/user/timestamp rather than every column', async () => {
    dataSource.query.mockResolvedValueOnce([{}]);
    await service.recordDecision(
      'p1',
      { leftSourceRef: 'left', leftKey: 'a', rightSourceRef: 'right', rightKey: 'b', decision: 'match' },
      'org1',
      'u1',
    );
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT ON CONSTRAINT "uq_match_decisions_pair"');
    expect(sql).toContain('DO UPDATE SET "decision" = EXCLUDED."decision", "user_id" = EXCLUDED."user_id", "created_at" = now()');
  });

  it('does not throw on a second submission for the same pair -- a steward correcting an earlier verdict', async () => {
    dataSource.query.mockResolvedValueOnce([{}]);
    dataSource.query.mockResolvedValueOnce([{}]);
    const submit = (decision: 'match' | 'no_match') =>
      service.recordDecision(
        'p1',
        { leftSourceRef: 'left', leftKey: 'a', rightSourceRef: 'right', rightKey: 'b', decision },
        'org1',
        'u1',
      );

    await expect(submit('match')).resolves.toBeDefined();
    await expect(submit('no_match')).resolves.toBeDefined();
    expect(dataSource.query).toHaveBeenCalledTimes(2);
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
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------
  // Ruling R43 (part 2): undo retracts a verdict; it does not assert the
  // opposite one. Retracting deletes the decision row(s), matched in
  // either key order the same way ScoringService's decisions CTE reads
  // them.
  // ---------------------------------------------------------------------

  describe('retractDecision', () => {
    it('deletes the decision row scoped by organization and project, normalized to either key order', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.retractDecision('p1', { leftKey: 'a', rightKey: 'b' }, 'org1');
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('DELETE FROM "match_decisions"');
      expect(sql).toContain('"organization_id" = $1 AND "project_id" = $2');
      expect(sql).toContain('least("left_key", "right_key") = least($3, $4)');
      expect(sql).toContain('greatest("left_key", "right_key") = greatest($3, $4)');
      expect(params).toEqual(['org1', 'p1', 'a', 'b']);
    });

    it('issues the identical query when the caller passes the pair in the opposite order -- order-independence lives in SQL least/greatest, not app logic', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.retractDecision('p1', { leftKey: 'b', rightKey: 'a' }, 'org1');
      const [sql, params] = dataSource.query.mock.calls[0];
      expect(sql).toContain('least("left_key", "right_key") = least($3, $4)');
      expect(sql).toContain('greatest("left_key", "right_key") = greatest($3, $4)');
      // The JS layer does not itself sort leftKey/rightKey -- it passes
      // them straight through positionally, and relies on least()/
      // greatest() at the database layer to make the match
      // order-independent. Confirming that means confirming this call's
      // params carry the arguments in the order given, unmodified.
      expect(params).toEqual(['org1', 'p1', 'b', 'a']);
    });

    it('does not filter on source ref -- it removes every decision row for the key pair, the same way the scoring CTE reads them', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await service.retractDecision('p1', { leftKey: 'a', rightKey: 'b' }, 'org1');
      const [sql] = dataSource.query.mock.calls[0];
      expect(sql).not.toContain('source_ref');
    });

    it('succeeds without error when there is no decision row for the pair -- that is the state the caller asked for, not an error', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      await expect(service.retractDecision('p1', { leftKey: 'a', rightKey: 'b' }, 'org1')).resolves.toBeUndefined();
    });

    it('rejects retracting against a project outside the caller organization, and never issues the delete', async () => {
      projectRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.retractDecision('p1', { leftKey: 'a', rightKey: 'b' }, 'other-org'),
      ).rejects.toThrow(NotFoundException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('refuses to retract on an inactive project (Ruling R32 applies to retraction too)', async () => {
      const inactiveProject = { ...project, status: 'inactive' } as unknown as MatchProject;
      projectRepo.findOne.mockResolvedValueOnce(inactiveProject);
      await expect(
        service.retractDecision('p1', { leftKey: 'a', rightKey: 'b' }, 'org1'),
      ).rejects.toThrow(ConflictException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });
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
    // Every test below stubs the `to_regclass` probe as its own call
    // (dataSource.query.mock.calls[0]) before the real select
    // (dataSource.query.mock.calls[1]) -- see the `workspaceExists`
    // branch this method added under Ruling R39.

    it('queries match_candidates scoped by organization and run, with no decision filter', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      const [sql, params] = dataSource.query.mock.calls[1];
      expect(sql).not.toContain('"decision" =');
      expect(params).toEqual(['org1', 'r1', 50, 0]);
      expect(sql).toContain('LIMIT $3 OFFSET $4');
    });

    it('orders by score with left_key/right_key tiebreakers, so paging is stable across ties (Minor finding)', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      const [sql] = dataSource.query.mock.calls[1];
      expect(sql).toContain('ORDER BY c."score" DESC, c."left_key", c."right_key"');
    });

    it('adds the decision filter as its own bound parameter, not string-interpolated', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', { decision: 'grey', limit: 10, offset: 5 } as any);
      const [sql, params] = dataSource.query.mock.calls[1];
      expect(sql).toContain('c."decision" = $3');
      expect(sql).toContain('LIMIT $4 OFFSET $5');
      expect(params).toEqual(['org1', 'r1', 'grey', 10, 5]);
    });

    it('caps the limit at the documented maximum regardless of what is requested', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', { limit: 999999 } as any);
      const [, params] = dataSource.query.mock.calls[1];
      expect(params[2]).toBe(500);
    });

    it('rejects listing candidates for a run outside the caller organization', async () => {
      runRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.listCandidates('r1', 'other-org', {})).rejects.toThrow(NotFoundException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    /**
     * Ruling R61. The workspace this method joins is keyed by PROJECT and
     * every run rebuilds it, so the record values it attaches are always
     * the CURRENT ones. Serving an older run puts today's values beside a
     * stale score and asks a steward to certify a pair against data the
     * score was never computed from -- and the verdict is permanent.
     *
     * Ruling R52 put that restriction in the UI, which is not the same
     * thing: that guard fails OPEN when the runs request errors, and the
     * endpoint was reachable directly regardless. These tests are about
     * the copy of the rule that can actually be relied on.
     *
     * The default `runRepo.findOne` mock returns the same run for both
     * the org-scoped load and the latest-completed lookup, so the happy
     * path above is already exercised; each test here overrides the
     * SECOND call.
     */
    describe('Ruling R61: only the latest completed run is served', () => {
      it('refuses a run that is not the latest completed run of its project', async () => {
        runRepo.findOne
          .mockResolvedValueOnce(run) // the org-scoped load
          .mockResolvedValueOnce({ ...run, id: 'r2' } as unknown as MatchRun); // a newer completed run

        await expect(service.listCandidates('r1', 'org1', { decision: 'grey' } as any)).rejects.toBeInstanceOf(
          ConflictException,
        );
        // Refused before any SQL: the to_regclass probe must not run
        // either, or a refusal still costs a round trip per request.
        expect(dataSource.query).not.toHaveBeenCalled();
      });

      it('names the run the steward should be reviewing instead', async () => {
        runRepo.findOne
          .mockResolvedValueOnce(run)
          .mockResolvedValueOnce({ ...run, id: 'r2' } as unknown as MatchRun);

        await expect(service.listCandidates('r1', 'org1', {})).rejects.toThrow(/r2/);
      });

      it('refuses when the project has no completed run at all, with its own message', async () => {
        runRepo.findOne.mockResolvedValueOnce(run).mockResolvedValueOnce(null);

        await expect(service.listCandidates('r1', 'org1', {})).rejects.toThrow(/no completed run/);
        expect(dataSource.query).not.toHaveBeenCalled();
      });

      it('looks the latest run up scoped to this project and organization, completed only, newest first', async () => {
        dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
        dataSource.query.mockResolvedValueOnce([]);
        await service.listCandidates('r1', 'org1', {});

        // The second findOne is the R61 lookup. Its ordering must match
        // `listRuns` exactly, or the run the UI calls latest and the run
        // this accepts could disagree.
        expect(runRepo.findOne).toHaveBeenNthCalledWith(2, {
          where: { projectId: 'p1', organizationId: 'org1', status: 'completed' },
          order: { startedAt: 'DESC', id: 'DESC' },
        });
      });

      it('serves the latest completed run normally', async () => {
        dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
        dataSource.query.mockResolvedValueOnce([{ left_key: 'a', right_key: 'b' }]);
        const rows = await service.listCandidates('r1', 'org1', { decision: 'grey' } as any);
        expect(rows).toHaveLength(1);
      });
    });

    // -----------------------------------------------------------------
    // Ruling R39: features, and the workspace join for record values
    // -----------------------------------------------------------------

    it('always selects features, alongside the pre-existing columns', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      const [sql] = dataSource.query.mock.calls[1];
      expect(sql).toContain('c."features"');
    });

    it('probes the run\'s project\'s left workspace table with to_regclass before the real select', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      expect(dataSource.query.mock.calls[0]).toEqual(['SELECT to_regclass($1) AS reg', ['matching.p_p1_left']]);
    });

    it('LEFT JOINs the workspace table on src_key, twice, when it exists -- both sides read the same dedupe-mode table', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      const [sql] = dataSource.query.mock.calls[1];
      expect(sql).toContain('LEFT JOIN matching.p_p1_left l ON l."src_key" = c."left_key"');
      expect(sql).toContain('LEFT JOIN matching.p_p1_left r ON r."src_key" = c."right_key"');
      expect(sql).toContain('to_jsonb(l.*) AS "left_record"');
      expect(sql).toContain('to_jsonb(r.*) AS "right_record"');
    });

    it('returns null records without joining or throwing when the workspace table has been dropped (retention sweep)', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: null }]);
      dataSource.query.mockResolvedValueOnce([
        { left_key: 'a', right_key: 'b', score: 0.9, decision: 'grey', blocking_pass: 'p1', features: {} },
      ]);
      const rows = await service.listCandidates('r1', 'org1', {});
      const [sql] = dataSource.query.mock.calls[1];
      expect(sql).not.toContain('LEFT JOIN matching.p_p1_left');
      expect(sql).toContain('NULL::jsonb AS "left_record"');
      expect(sql).toContain('NULL::jsonb AS "right_record"');
      expect(rows).toHaveLength(1);
    });

    it('treats an empty to_regclass result the same as a missing relation, rather than throwing', async () => {
      dataSource.query.mockResolvedValueOnce([]);
      dataSource.query.mockResolvedValueOnce([]);
      await service.listCandidates('r1', 'org1', {});
      const [sql] = dataSource.query.mock.calls[1];
      expect(sql).toContain('NULL::jsonb AS "left_record"');
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
        order: { flagged: 'DESC', size: 'DESC', id: 'ASC' },
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
      expect(dataSource.query).not.toHaveBeenCalled();
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

  // ---------------------------------------------------------------------
  // Ruling R36: estimate reads a workspace table a run's own materialize
  // step creates, and never materializes on demand (see
  // MatchingService.assertWorkspaceMaterialized) -- copying data early,
  // before the wizard's step 4 records lawful basis and data owner, would
  // invert the order this feature is built around. Before a project's
  // first run, that table does not exist, and this must surface as a
  // clean, actionable ConflictException rather than a raw Postgres
  // "relation ... does not exist" error.
  // ---------------------------------------------------------------------

  describe('Ruling R36: estimate refuses cleanly before the first run', () => {
    it('throws ConflictException naming the reason when the workspace table does not exist yet', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: null }]);

      let caught: unknown;
      try {
        await service.estimate('p1', 'org1');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).message).toMatch(/has not run yet/);
      expect(blocking.estimate).not.toHaveBeenCalled();
    });

    it('checks existence with to_regclass against the project\'s left workspace table, not by pattern-matching a driver error', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: null }]);

      await expect(service.estimate('p1', 'org1')).rejects.toThrow(ConflictException);

      expect(materialize.workspaceTable).toHaveBeenCalledWith('p1', 'left');
      expect(dataSource.query).toHaveBeenCalledWith('SELECT to_regclass($1) AS reg', ['matching.p_p1_left']);
    });

    it('does not throw, and calls through to BlockingService.estimate, once the workspace table exists', async () => {
      dataSource.query.mockResolvedValueOnce([{ reg: 'matching.p_p1_left' }]);
      const expected = { perPass: [], totalEstimatedPairs: 0, hasInexactPass: false, exceedsCap: false, refused: false };
      blocking.estimate.mockResolvedValueOnce(expected);

      const result = await service.estimate('p1', 'org1');

      expect(result).toBe(expected);
      expect(blocking.estimate).toHaveBeenCalledWith(project);
    });
  });
});
