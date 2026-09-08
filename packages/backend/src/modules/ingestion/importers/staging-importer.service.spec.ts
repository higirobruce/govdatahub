import { BadRequestException } from '@nestjs/common';
import { StagingImporterService } from './staging-importer.service';

describe('StagingImporterService.dropTable (SEC-05)', () => {
  let service: StagingImporterService;
  const stagedDataRepository = {};
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
