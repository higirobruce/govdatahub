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
});
