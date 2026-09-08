import { BadRequestException } from '@nestjs/common';
import { StagingImporterService } from './staging-importer.service';

describe('StagingImporterService.dropTable (SEC-05)', () => {
  let service: StagingImporterService;
  const stagedDataRepository = { find: jest.fn(), delete: jest.fn() };
  const dataSource = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    // Real constructor is (stagedDataRepository, dataSource) — stub each
    // parameter in order, with dataSource in its correct position.
    service = new StagingImporterService(
      stagedDataRepository as any,
      dataSource as any,
    );
  });

  it('drops a well-formed identifier, double-quoted', async () => {
    await service.dropTable('staging_org_abc_customers');
    expect(dataSource.query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "staging_org_abc_customers"',
    );
  });

  it.each([
    'foo"; DROP TABLE users;--',
    'foo bar',
    'foo;bar',
    '1starts_with_digit',
    '',
    'a'.repeat(129),
  ])('rejects malicious or malformed identifier %j', async (name) => {
    await expect(service.dropTable(name as string)).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});

describe('StagingImporterService.deleteStagedData (SEC-05)', () => {
  let service: StagingImporterService;
  const stagedDataRepository = { find: jest.fn(), delete: jest.fn() };
  const dataSource = { query: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StagingImporterService(
      stagedDataRepository as any,
      dataSource as any,
    );
  });

  it('delegates to dropTable and refuses a malformed tableName without executing a query', async () => {
    const dropTableSpy = jest.spyOn(service, 'dropTable');
    stagedDataRepository.find.mockResolvedValue([
      { tableName: 'foo"; DROP TABLE users;--' },
    ]);
    stagedDataRepository.delete.mockResolvedValue({ affected: 1 });

    // deleteStagedData swallows per-table drop failures (existing behavior)
    // so it resolves even though the underlying drop was rejected.
    await expect(
      service.deleteStagedData('job-1', 'org-1'),
    ).resolves.toBeUndefined();

    expect(dropTableSpy).toHaveBeenCalledWith('foo"; DROP TABLE users;--');
    expect(dataSource.query).not.toHaveBeenCalled();
    // Metadata deletion still proceeds despite the rejected drop.
    expect(stagedDataRepository.delete).toHaveBeenCalledWith({
      importJobId: 'job-1',
      organizationId: 'org-1',
    });
  });
});
