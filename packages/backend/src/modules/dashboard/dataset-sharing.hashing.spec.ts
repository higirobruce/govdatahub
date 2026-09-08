import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DatasetSharingService } from './dataset-sharing.service';
import { sha256Hex } from '../../common/hash.util';
import {
  DatasetShare,
  StagedData,
  Connection,
  Transformation,
  CachedResult,
} from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { EncryptionService } from '../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';

/**
 * Regression spec for the SEC-09 hashing contract on DatasetSharingService:
 * - entity persists SHA-256 hashes only (never plaintext)
 * - plaintext is returned exactly once, from createShare / regenerateApiKey /
 *   regenerateShareToken responses
 * - every credential lookup hashes the presented value before querying
 */
describe('DatasetSharingService hashing contract', () => {
  let service: DatasetSharingService;
  let datasetShareRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
  };
  let stagedDataRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    datasetShareRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      // Echo back whatever entity was passed in, mirroring TypeORM's save().
      save: jest.fn(async (entity) => entity),
    };
    stagedDataRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetSharingService,
        { provide: getRepositoryToken(DatasetShare), useValue: datasetShareRepo },
        { provide: getRepositoryToken(StagedData), useValue: stagedDataRepo },
        { provide: getRepositoryToken(Connection), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Transformation), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(CachedResult), useValue: { findOne: jest.fn() } },
        { provide: ConnectionsService, useValue: {} },
        { provide: EncryptionService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(DatasetSharingService);
  });

  describe('createShare', () => {
    it('persists only 64-hex hashes and returns plaintext exactly once', async () => {
      // No existing active share for this dataset.
      datasetShareRepo.findOne.mockResolvedValueOnce(null);
      // verifyDatasetExists + getDatasetMetadata both look up staged data.
      stagedDataRepo.findOne.mockResolvedValue({
        id: 'ds-1',
        organizationId: 'org-1',
        tableName: 'customers',
        rowCount: 42,
        schema: {},
      });

      const result = await service.createShare(
        {
          name: 'Customer Analytics',
          description: 'desc',
          datasetType: 'staged',
          datasetId: 'ds-1',
          accessLevel: 'private',
          generateApiKey: true,
          generateShareToken: true,
        } as any,
        'org-1',
        'user-1',
      );

      expect(datasetShareRepo.save).toHaveBeenCalledTimes(1);
      const persisted = datasetShareRepo.save.mock.calls[0][0];

      // Entity handed to save() must carry hashes, never plaintext.
      expect(persisted.apiKey).toMatch(/^[0-9a-f]{64}$/);
      expect(persisted.shareToken).toMatch(/^[0-9a-f]{64}$/);
      expect(persisted.apiKey).not.toBe(result.apiKey);
      expect(persisted.shareToken).not.toBe(result.shareToken);
      expect(persisted.apiKey).toBe(sha256Hex(result.apiKey!));
      expect(persisted.shareToken).toBe(sha256Hex(result.shareToken!));

      // Response carries the one-time plaintext, in the expected shapes.
      expect(result.apiKey!.startsWith('gd_')).toBe(true);
      expect(result.shareToken).toMatch(/^[0-9a-f]{48}$/);
    });
  });

  describe('regenerateApiKey', () => {
    it('persists the hash and returns the plaintext once', async () => {
      const existingShare = {
        id: 'share-1',
        organizationId: 'org-1',
        apiKey: 'old-hash',
        shareToken: 'unchanged-hash',
      } as DatasetShare;
      datasetShareRepo.findOne.mockResolvedValueOnce(existingShare);

      const result = await service.regenerateApiKey('share-1', 'org-1');

      expect(datasetShareRepo.save).toHaveBeenCalledTimes(1);
      const persisted = datasetShareRepo.save.mock.calls[0][0];

      expect(persisted.apiKey).toMatch(/^[0-9a-f]{64}$/);
      expect(persisted.apiKey).not.toBe(result.apiKey);
      expect(persisted.apiKey).toBe(sha256Hex(result.apiKey!));
      expect(result.apiKey!.startsWith('gd_')).toBe(true);
    });
  });

  describe('regenerateShareToken', () => {
    it('persists the hash and returns the plaintext once', async () => {
      const existingShare = {
        id: 'share-1',
        organizationId: 'org-1',
        apiKey: 'unchanged-hash',
        shareToken: 'old-hash',
      } as DatasetShare;
      datasetShareRepo.findOne.mockResolvedValueOnce(existingShare);

      const result = await service.regenerateShareToken('share-1', 'org-1');

      expect(datasetShareRepo.save).toHaveBeenCalledTimes(1);
      const persisted = datasetShareRepo.save.mock.calls[0][0];

      expect(persisted.shareToken).toMatch(/^[0-9a-f]{64}$/);
      expect(persisted.shareToken).not.toBe(result.shareToken);
      expect(persisted.shareToken).toBe(sha256Hex(result.shareToken!));
      expect(result.shareToken).toMatch(/^[0-9a-f]{48}$/);
    });
  });

  describe('getDataByApiKey', () => {
    it('hashes the presented key before querying', async () => {
      datasetShareRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.getDataByApiKey('some-presented-key')).rejects.toThrow(
        NotFoundException,
      );

      expect(datasetShareRepo.findOne).toHaveBeenCalledWith({
        where: { apiKey: sha256Hex('some-presented-key'), active: true },
      });
    });
  });

  describe('getDataByShareToken', () => {
    it('hashes the presented token before querying', async () => {
      datasetShareRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.getDataByShareToken('some-presented-token'),
      ).rejects.toThrow(NotFoundException);

      expect(datasetShareRepo.findOne).toHaveBeenCalledWith({
        where: { shareToken: sha256Hex('some-presented-token'), active: true },
      });
    });
  });
});
