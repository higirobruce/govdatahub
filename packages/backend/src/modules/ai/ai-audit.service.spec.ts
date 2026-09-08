import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AiAuditService } from './ai-audit.service';
import { AiInteraction } from '../../database/entities';

describe('AiAuditService', () => {
  let service: AiAuditService;
  const repo = {
    create: jest.fn((entry) => entry),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.create.mockImplementation((entry) => entry);

    const module = await Test.createTestingModule({
      providers: [
        AiAuditService,
        { provide: getRepositoryToken(AiInteraction), useValue: repo },
      ],
    }).compile();

    service = module.get(AiAuditService);
  });

  describe('log', () => {
    it('persists a successful interaction via the repository', async () => {
      repo.save.mockResolvedValue(undefined);

      await service.log({
        organizationId: 'org-1',
        userId: 'user-1',
        feature: 'nl2sql_generate',
        model: 'gpt-4',
        promptChars: 42,
        responseChars: 100,
        latencyMs: 250,
        success: true,
        generatedSql: 'SELECT 1',
        executed: true,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          userId: 'user-1',
          feature: 'nl2sql_generate',
          model: 'gpt-4',
          promptChars: 42,
          responseChars: 100,
          latencyMs: 250,
          success: true,
          generatedSql: 'SELECT 1',
          executed: true,
        }),
      );
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('defaults optional fields when omitted', async () => {
      repo.save.mockResolvedValue(undefined);

      await service.log({
        organizationId: 'org-1',
        feature: 'nl2sql_explain',
        promptChars: 10,
        responseChars: 0,
        latencyMs: 5,
        success: false,
        errorMessage: 'boom',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          model: null,
          errorMessage: 'boom',
          generatedSql: null,
          executed: false,
          success: false,
        }),
      );
    });

    it('swallows repository errors and never throws', async () => {
      repo.save.mockRejectedValue(new Error('db is down'));

      await expect(
        service.log({
          organizationId: 'org-1',
          feature: 'nl2sql_generate',
          promptChars: 1,
          responseChars: 1,
          latencyMs: 1,
          success: true,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('scopes results to the given organization and orders newest first', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('org-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        order: { createdAt: 'DESC' },
        take: 100,
      });
    });

    it('respects a custom limit', async () => {
      repo.find.mockResolvedValue([]);

      await service.list('org-2', 10);

      expect(repo.find).toHaveBeenCalledWith({
        where: { organizationId: 'org-2' },
        order: { createdAt: 'DESC' },
        take: 10,
      });
    });
  });
});
