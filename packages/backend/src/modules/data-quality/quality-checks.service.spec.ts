import { Logger } from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { QualityChecksService } from './quality-checks.service';

describe('QualityChecksService.suggestChecks (AI-suggested quality checks)', () => {
  let service: QualityChecksService;

  const checksRepo = {};
  const runsRepo = {};
  const connectionsService = {};
  const profilingService = {
    getLatestProfile: jest.fn(),
  };
  const aiService = {
    getProvider: jest.fn(),
  };
  const aiAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const settingsService = {
    getOrganizationSettings: jest.fn(),
  };
  const provider = {
    generateJson: jest.fn(),
  };
  // Unused by suggestChecks — the service constructor now also takes the
  // three match-repository dependencies used by the no_duplicates check.
  const projectRepo = {};
  const matchRunRepo = {};
  const entityRepo = {};

  const settings = {
    aiProvider: 'local',
    aiModel: 'codellama',
  };

  const profile = {
    id: 'profile-1',
    connectionId: 'conn-1',
    schemaName: 'public',
    tableName: 'customers',
    rowCount: 1000,
    columnProfiles: [
      {
        name: 'email',
        dataType: 'text',
        totalRows: 1000,
        nullCount: 1,
        nullPercent: 0.1,
        distinctCount: 999,
        distinctPercent: 99.9,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    settingsService.getOrganizationSettings.mockResolvedValue(settings);
    aiService.getProvider.mockReturnValue(provider);

    service = new QualityChecksService(
      checksRepo as any,
      runsRepo as any,
      connectionsService as any,
      profilingService as any,
      aiService as any,
      aiAudit as any,
      settingsService as any,
      projectRepo as any,
      matchRunRepo as any,
      entityRepo as any,
    );
  });

  it('returns only the valid suggestion, filtering out a bogus checkType', async () => {
    profilingService.getLatestProfile.mockResolvedValue(profile);
    provider.generateJson.mockResolvedValue({
      suggestions: [
        {
          checkType: 'not_null',
          columnName: 'email',
          config: { maxNullPercent: 1 },
          rationale: '99.9% non-null, expect near-zero nulls',
        },
        {
          checkType: 'custom_sql',
          columnName: 'email',
          config: { sql: 'SELECT 1' },
          rationale: 'bogus — never allowed',
        },
      ],
    });

    const result = await service.suggestChecks('org-1', {
      connectionId: 'conn-1',
      schemaName: 'public',
      tableName: 'customers',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ checkType: 'not_null', columnName: 'email' }),
    );
    expect(aiAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'quality_suggest', success: true }),
    );
  });

  it('filters out a suggestion referencing an unknown column name', async () => {
    profilingService.getLatestProfile.mockResolvedValue(profile);
    provider.generateJson.mockResolvedValue({
      suggestions: [
        {
          checkType: 'unique',
          columnName: 'nonexistent_column',
          config: {},
          rationale: 'should be dropped',
        },
      ],
    });

    const result = await service.suggestChecks('org-1', {
      connectionId: 'conn-1',
      schemaName: 'public',
      tableName: 'customers',
    });

    expect(result).toHaveLength(0);
  });

  it('throws a 400 when no profile exists for the table', async () => {
    profilingService.getLatestProfile.mockResolvedValue(null);

    await expect(
      service.suggestChecks('org-1', {
        connectionId: 'conn-1',
        schemaName: 'public',
        tableName: 'customers',
      }),
    ).rejects.toThrow('Profile the table first');

    expect(aiService.getProvider).not.toHaveBeenCalled();
  });

  // Ruling R40: ALLOWED_SUGGESTION_CHECK_TYPES is a module-private const and
  // is not exported, so we test the guarantee behaviorally instead of
  // reaching into that data structure. If the AI provider suggests
  // no_duplicates anyway (it has no way to invent a matchProjectId), the
  // suggestion must be dropped while a legitimate suggestion survives.
  it('drops a no_duplicates suggestion even if the AI provider returns one, because it needs a match project', async () => {
    profilingService.getLatestProfile.mockResolvedValue(profile);
    provider.generateJson.mockResolvedValue({
      suggestions: [
        {
          checkType: 'not_null',
          columnName: 'email',
          config: { maxNullPercent: 1 },
          rationale: '99.9% non-null, expect near-zero nulls',
        },
        {
          checkType: 'no_duplicates',
          config: { matchProjectId: 'p1', maxDuplicateClusters: 0 },
          rationale: 'invented — no suggestion can know a match project id',
        },
      ],
    });

    const result = await service.suggestChecks('org-1', {
      connectionId: 'conn-1',
      schemaName: 'public',
      tableName: 'customers',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({ checkType: 'not_null', columnName: 'email' }),
    );
    expect(result.some((s) => s.checkType === 'no_duplicates')).toBe(false);
  });
});

describe('QualityChecksService.runCheck no_duplicates check', () => {
  let service: QualityChecksService;

  const checksRepo = { findOne: jest.fn(), save: jest.fn() };
  const runsRepo = { create: jest.fn(), save: jest.fn() };
  const connectionsService = {};
  const profilingService = {};
  const aiService = {};
  const aiAudit = {};
  const settingsService = {};
  const projectRepo = { findOne: jest.fn() };
  const matchRunRepo = { findOne: jest.fn() };
  const entityRepo = { count: jest.fn() };

  // Ruling R47: the run id is deliberately distinctive (nothing like the
  // project id or org id) so a regression that threads the wrong id into
  // entityRepo.count's `runId` filter -- e.g. dropping it, or passing the
  // project id instead -- fails the assertions below instead of passing by
  // coincidence.
  const validProject = { id: 'p1', organizationId: 'org1' };
  const latestCompletedRun = {
    id: 'run-latest-7c2f',
    projectId: 'p1',
    organizationId: 'org1',
    status: 'completed',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // The three error-path tests below deliberately hit this.logger.warn();
    // suppress it so it doesn't spill into pristine test output (same
    // convention as match-run.service.spec.ts).
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined as any);

    // runCheck's first argument in these tests IS the check object (not an
    // id) — checksRepo.findOne is a pass-through stand-in for the real
    // lookup, echoing back whatever was passed as `id`, so the tests can
    // hand runCheck a fully-formed check directly.
    checksRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve(where.id));
    checksRepo.save.mockResolvedValue(undefined);
    runsRepo.create.mockImplementation((r: any) => r);
    runsRepo.save.mockImplementation((r: any) => Promise.resolve(r));

    // Happy-path defaults: a valid project, a completed run, a count.
    // Each test below overrides exactly the one mock its title names.
    projectRepo.findOne.mockResolvedValue(validProject);
    matchRunRepo.findOne.mockResolvedValue(latestCompletedRun);
    entityRepo.count.mockResolvedValue(0);

    service = new QualityChecksService(
      checksRepo as any,
      runsRepo as any,
      connectionsService as any,
      profilingService as any,
      aiService as any,
      aiAudit as any,
      settingsService as any,
      projectRepo as any,
      matchRunRepo as any,
      entityRepo as any,
    );
  });

  it('passes when the duplicate cluster count is at or below the limit', async () => {
    entityRepo.count.mockResolvedValue(2);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p1', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('pass');
    expect(result.actualValue).toBe(2);

    // Ruling R47: lock the run-scoping invariant, not just the outcome.
    // matchRunRepo.findOne must be scoped to this project/org and filtered
    // to completed runs (ordered so "latest" is well-defined).
    expect(matchRunRepo.findOne).toHaveBeenCalledWith({
      where: { projectId: 'p1', organizationId: 'org1', status: 'completed' },
      order: { startedAt: 'DESC' },
    });
    // entityRepo.count must be scoped to this project AND this specific
    // run (not every historical run of the project) AND this org, and
    // must filter to clusters with size > 1. Threading the wrong id here
    // -- or dropping runId entirely -- would silently sum duplicates
    // across every run of the project instead of just the latest one.
    expect(entityRepo.count).toHaveBeenCalledWith({
      where: {
        projectId: 'p1',
        runId: 'run-latest-7c2f',
        organizationId: 'org1',
        size: MoreThan(1),
      },
    });
  });

  it('fails when the duplicate cluster count is above the limit', async () => {
    entityRepo.count.mockResolvedValue(9);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p1', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('fail');
  });

  it('errors when the referenced match project belongs to another organization', async () => {
    projectRepo.findOne.mockResolvedValue(null);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p-other', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('error');
  });

  it('errors when the match project has never completed a run', async () => {
    matchRunRepo.findOne.mockResolvedValue(null);
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { matchProjectId: 'p1', maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('error');
  });

  it('errors, rather than fails, on a malformed config (missing matchProjectId)', async () => {
    const result = await service.runCheck({ checkType: 'no_duplicates',
      config: { maxDuplicateClusters: 5 } } as any, 'org1');
    expect(result.status).toBe('error');
    expect(projectRepo.findOne).not.toHaveBeenCalled();
  });
});
