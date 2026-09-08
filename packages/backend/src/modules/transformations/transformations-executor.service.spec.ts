import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransformationsExecutorService } from './transformations-executor.service';
import { Transformation, TransformationRun, CachedResult } from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';

describe('TransformationsExecutorService org isolation (SEC-03)', () => {
  let service: TransformationsExecutorService;
  const transformationsRepository = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TransformationsExecutorService,
        { provide: getRepositoryToken(Transformation), useValue: transformationsRepository },
        { provide: getRepositoryToken(TransformationRun), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(CachedResult), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: ConnectionsService, useValue: { getDriver: jest.fn() } },
        { provide: EncryptionService, useValue: { decryptObject: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(300000) } },
      ],
    }).compile();
    service = module.get(TransformationsExecutorService);
  });

  it('rejects execution when the transformation belongs to another org', async () => {
    transformationsRepository.findOne.mockResolvedValue(null); // scoped query finds nothing
    await expect(
      service.execute('xform-owned-by-org-B', 'manual', 'org-A'),
    ).rejects.toThrow(BadRequestException);
    expect(transformationsRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'xform-owned-by-org-B', organizationId: 'org-A' },
    });
  });
});
