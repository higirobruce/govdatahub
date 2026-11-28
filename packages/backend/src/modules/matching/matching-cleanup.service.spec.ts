import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MatchingCleanupService } from './matching-cleanup.service';
import { MatchProject, MatchRun } from '../../database/entities';
import { MaterializeService } from './materialize.service';

describe('MatchingCleanupService', () => {
  let service: MatchingCleanupService;
  let dataSource: { query: jest.Mock };
  let projectRepo: Repository<MatchProject>;
  let runRepo: Repository<MatchRun>;

  beforeEach(async () => {
    // Mock repositories
    const mockProjectRepo = {
      find: jest.fn(),
    };

    const mockRunRepo = {
      find: jest.fn(),
    };

    // Mock DataSource
    dataSource = {
      query: jest.fn(),
    };

    // Mock MaterializeService
    const mockMaterializeService = {
      workspaceTable: jest.fn((projectId: string, side: 'left' | 'right') => {
        return `matching.p_${projectId.replace(/-/g, '_')}_${side}`;
      }),
    };

    // Mock ConfigService
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: any) => {
        if (key === 'MATCHING_RETENTION_DAYS') {
          return defaultValue;
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingCleanupService,
        {
          provide: 'MatchProjectRepository',
          useValue: mockProjectRepo,
        },
        {
          provide: 'MatchRunRepository',
          useValue: mockRunRepo,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: MaterializeService,
          useValue: mockMaterializeService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MatchingCleanupService>(MatchingCleanupService);
    projectRepo = module.get('MatchProjectRepository');
    runRepo = module.get('MatchRunRepository');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('drops workspace tables and candidates for a project past its retention', async () => {
    projectRepo.find = jest.fn().mockResolvedValue([{ id: 'p1', retentionDays: 30, organizationId: 'org1' }]);
    runRepo.find = jest.fn().mockResolvedValue([{ id: 'r1', startedAt: new Date('2020-01-01') }]);
    dataSource.query = jest.fn().mockResolvedValue([]);

    await service.cleanupExpiredWorkspaces();

    const sqls = dataSource.query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => s.includes('DROP TABLE IF EXISTS matching.p_p1_left'))).toBe(true);
    expect(sqls.some((s) => s.includes('DELETE FROM "match_candidates"'))).toBe(true);
  });

  it('keeps decisions, entities, the crosswalk, the gold set, and norm cache', async () => {
    projectRepo.find = jest.fn().mockResolvedValue([]);
    runRepo.find = jest.fn().mockResolvedValue([]);
    dataSource.query = jest.fn().mockResolvedValue([]);

    await service.cleanupExpiredWorkspaces();

    const sqls = dataSource.query.mock.calls.map((c) => String(c[0])).join(' ');
    expect(sqls).not.toContain('match_decisions');
    expect(sqls).not.toContain('match_crosswalk');
    expect(sqls).not.toContain('match_gold_pairs');
    expect(sqls).not.toContain('match_entities');
    expect(sqls).not.toContain('match_norm_cache');
  });

  it('leaves a project inside its retention window alone', async () => {
    projectRepo.find = jest.fn().mockResolvedValue([{ id: 'p1', retentionDays: 30, organizationId: 'org1' }]);
    runRepo.find = jest.fn().mockResolvedValue([{ id: 'r1', startedAt: new Date() }]);
    dataSource.query = jest.fn().mockResolvedValue([]);

    await service.cleanupExpiredWorkspaces();

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('never throws, and keeps sweeping after one project fails', async () => {
    projectRepo.find = jest.fn().mockResolvedValue([
      { id: 'p1', retentionDays: 1, organizationId: 'org1' },
      { id: 'p2', retentionDays: 1, organizationId: 'org1' },
    ]);
    runRepo.find = jest.fn().mockResolvedValue([{ id: 'r1', startedAt: new Date('2020-01-01') }]);
    dataSource.query = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom')) // p1 fails
      .mockResolvedValue([]); // p2 succeeds

    const out = await service.cleanupExpiredWorkspaces();
    expect(out.projectsSwept).toBe(1);
  });

  it('skips projects with no runs entirely', async () => {
    projectRepo.find = jest.fn().mockResolvedValue([{ id: 'p1', retentionDays: 30, organizationId: 'org1' }]);
    runRepo.find = jest.fn().mockResolvedValue([]); // No runs for this project
    dataSource.query = jest.fn().mockResolvedValue([]);

    await service.cleanupExpiredWorkspaces();

    // No SQL should be executed because project has no runs
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('resolves safely when initial project fetch fails', async () => {
    projectRepo.find = jest.fn().mockRejectedValue(new Error('Database connection failed'));
    dataSource.query = jest.fn().mockResolvedValue([]);

    const out = await service.cleanupExpiredWorkspaces();

    // Should resolve with projectsSwept: 0, not throw
    expect(out.projectsSwept).toBe(0);
  });

  it('leaves a project alone when it has both old and recent runs', async () => {
    projectRepo.find = jest.fn().mockResolvedValue([{ id: 'p1', retentionDays: 30, organizationId: 'org1' }]);
    // Mix of old run (2020) and fresh run (today)
    runRepo.find = jest.fn().mockResolvedValue([
      { id: 'r1', startedAt: new Date('2020-01-01') },
      { id: 'r2', startedAt: new Date() }, // Recent run protects the project
    ]);
    dataSource.query = jest.fn().mockResolvedValue([]);

    await service.cleanupExpiredWorkspaces();

    // No cleanup should happen because one run is recent
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
