import { Nl2sqlService } from './nl2sql.service';

describe('Nl2sqlService.diagnoseSql (error doctor)', () => {
  let service: Nl2sqlService;

  const aiService = {
    getProvider: jest.fn(),
  };
  const aiAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const settingsService = {
    getOrganizationSettings: jest.fn(),
  };
  const schemaContextBuilder = {
    buildContext: jest.fn(),
  };
  const sqlValidator = {
    validate: jest.fn(),
    addLimitIfMissing: jest.fn(),
  };
  const queriesService = {
    executeQuery: jest.fn(),
  };
  const provider = {
    generateJson: jest.fn(),
  };

  const settings = {
    aiProvider: 'local',
    aiModel: 'codellama',
  };

  const schemaContext = {
    connections: [
      {
        connectionId: 'conn-1',
        connectionName: 'main-db',
        databaseType: 'postgresql',
        tables: [
          {
            name: 'users',
            schema: 'public',
            columns: [
              { name: 'id', type: 'uuid', nullable: false, primaryKey: true },
              { name: 'emial', type: 'text', nullable: false },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    settingsService.getOrganizationSettings.mockResolvedValue(settings);
    schemaContextBuilder.buildContext.mockResolvedValue(schemaContext);
    aiService.getProvider.mockReturnValue(provider);

    service = new Nl2sqlService(
      aiService as any,
      aiAudit as any,
      settingsService as any,
      schemaContextBuilder as any,
      sqlValidator as any,
      queriesService as any
    );
  });

  it('calls generateJson with a prompt containing both the SQL and the error message', async () => {
    provider.generateJson.mockResolvedValue({
      diagnosis: 'Column "emial" does not exist, did you mean "email"?',
      suggestedSql: 'SELECT emial FROM users',
    });
    sqlValidator.validate.mockReturnValue({ isValid: true, errors: [], warnings: [] });

    await service.diagnoseSql('org-1', {
      sql: 'SELECT emial FROM users',
      errorMessage: 'column "emial" does not exist',
    });

    expect(provider.generateJson).toHaveBeenCalledTimes(1);
    const [prompt, settingsArg] = provider.generateJson.mock.calls[0];
    expect(prompt).toContain('SELECT emial FROM users');
    expect(prompt).toContain('column "emial" does not exist');
    expect(settingsArg).toBe(settings);
  });

  it('returns a suggestion that fails validation with non-empty validationWarnings, without blocking', async () => {
    provider.generateJson.mockResolvedValue({
      diagnosis: 'Query drops the table instead of selecting from it.',
      suggestedSql: 'DROP TABLE users',
    });
    sqlValidator.validate.mockReturnValue({
      isValid: false,
      errors: ['Dangerous SQL pattern detected: DROP'],
      warnings: [],
    });

    const result = await service.diagnoseSql('org-1', {
      sql: 'DROP TABLE users',
      errorMessage: 'some error',
    });

    expect(result.suggestedSql).toBe('DROP TABLE users');
    expect(result.validationWarnings.length).toBeGreaterThan(0);
  });

  it('sets suggestedSql to null when the AI is not confident', async () => {
    provider.generateJson.mockResolvedValue({
      diagnosis: 'Not enough context to determine a fix.',
      suggestedSql: null,
    });

    const result = await service.diagnoseSql('org-1', {
      sql: 'SELECT * FROM nonexistent',
      errorMessage: 'relation "nonexistent" does not exist',
    });

    expect(result.suggestedSql).toBeNull();
    expect(sqlValidator.validate).not.toHaveBeenCalled();
  });

  it('logs an audit entry with feature error_doctor on success', async () => {
    provider.generateJson.mockResolvedValue({
      diagnosis: 'diagnosis text',
      suggestedSql: null,
    });

    await service.diagnoseSql('org-1', {
      sql: 'SELECT 1',
      errorMessage: 'boom',
    }, 'user-1');

    expect(aiAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        feature: 'error_doctor',
        model: 'codellama',
        success: true,
        executed: false,
      })
    );
  });

  it('logs an audit entry and throws BadRequestException when the AI provider fails', async () => {
    provider.generateJson.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      service.diagnoseSql('org-1', { sql: 'SELECT 1', errorMessage: 'boom' })
    ).rejects.toThrow('Failed to diagnose SQL');

    expect(aiAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'error_doctor',
        success: false,
      })
    );
  });
});
