import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ModuleRef } from '@nestjs/core';
import { PipelinesExecutorService } from './pipelines-executor.service';
import { Pipeline, PipelineRun, SavedCrossQuery } from '../../database/entities';
import { TransformationsExecutorService } from '../transformations/transformations-executor.service';
import { CrossQueryExecutorService } from '../cross-query/cross-query-executor.service';
import { DatabaseSourceImporterService } from '../ingestion/importers/database-source-importer.service';
import { PipelinesSchedulerService } from './pipelines-scheduler.service';

describe('PipelinesExecutorService org isolation (SEC-04)', () => {
  let service: PipelinesExecutorService;
  const savedCrossQueryRepository = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PipelinesExecutorService,
        { provide: getRepositoryToken(Pipeline), useValue: { findOne: jest.fn(), update: jest.fn(), create: jest.fn() } },
        { provide: getRepositoryToken(PipelineRun), useValue: { findOne: jest.fn(), update: jest.fn(), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(SavedCrossQuery), useValue: savedCrossQueryRepository },
        { provide: TransformationsExecutorService, useValue: { execute: jest.fn() } },
        { provide: CrossQueryExecutorService, useValue: { executeCrossQuery: jest.fn() } },
        { provide: DatabaseSourceImporterService, useValue: { importFromDatabase: jest.fn() } },
        { provide: PipelinesSchedulerService, useValue: { setExecutor: jest.fn() } },
        { provide: ModuleRef, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(PipelinesExecutorService);
  });

  it('scopes saved cross-query lookups to the executing org (SEC-04)', async () => {
    savedCrossQueryRepository.findOne.mockResolvedValue(null);
    await expect(
      (service as any).executeStep(
        { id: 's1', type: 'cross-query', config: { savedCrossQueryId: 'q-org-B' } },
        'org-A',
      ),
    ).rejects.toThrow('SavedCrossQuery q-org-B not found');
    expect(savedCrossQueryRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'q-org-B', organizationId: 'org-A' },
    });
  });
});
