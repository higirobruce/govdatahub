import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DatasetShare,
  StagedData,
  Connection,
  Transformation,
  TransformationRun,
  CachedResult,
  QueryHistory,
  ImportJob,
} from '../../database/entities';
import { DashboardController } from './dashboard.controller';
import { PublicDatasetController } from './public-dataset.controller';
import { DatasetCatalogService } from './dataset-catalog.service';
import { DatasetSharingService } from './dataset-sharing.service';
import { ConnectionsModule } from '../connections/connections.module';
import { EncryptionModule } from '../encryption/encryption.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DatasetShare,
      StagedData,
      Connection,
      Transformation,
      TransformationRun,
      CachedResult,
      QueryHistory,
      ImportJob,
    ]),
    ConnectionsModule,
    EncryptionModule,
  ],
  controllers: [DashboardController, PublicDatasetController],
  providers: [DatasetCatalogService, DatasetSharingService],
  exports: [DatasetCatalogService, DatasetSharingService],
})
export class DashboardModule {}
