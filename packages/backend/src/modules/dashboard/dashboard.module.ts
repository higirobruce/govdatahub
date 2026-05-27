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
  SavedCrossQuery,
  Dashboard,
} from '../../database/entities';
import { DashboardController } from './dashboard.controller';
import { PublicDatasetController } from './public-dataset.controller';
import { DashboardsController } from './dashboards.controller';
import { DatasetCatalogService } from './dataset-catalog.service';
import { DatasetSharingService } from './dataset-sharing.service';
import { DashboardsService } from './dashboards.service';
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
      SavedCrossQuery,
      Dashboard,
    ]),
    ConnectionsModule,
    EncryptionModule,
  ],
  controllers: [
    DashboardController,
    PublicDatasetController,
    DashboardsController,
  ],
  providers: [DatasetCatalogService, DatasetSharingService, DashboardsService],
  exports: [DatasetCatalogService, DatasetSharingService, DashboardsService],
})
export class DashboardModule {}
