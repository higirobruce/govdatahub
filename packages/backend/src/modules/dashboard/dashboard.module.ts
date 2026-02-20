import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DatasetShare,
  StagedData,
  Connection,
  Transformation,
  CachedResult,
  QueryHistory,
  ImportJob,
} from '../../database/entities';
import { DashboardController } from './dashboard.controller';
import { PublicDatasetController } from './public-dataset.controller';
import { DatasetCatalogService } from './dataset-catalog.service';
import { DatasetSharingService } from './dataset-sharing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DatasetShare,
      StagedData,
      Connection,
      Transformation,
      CachedResult,
      QueryHistory,
      ImportJob,
    ]),
  ],
  controllers: [DashboardController, PublicDatasetController],
  providers: [DatasetCatalogService, DatasetSharingService],
  exports: [DatasetCatalogService, DatasetSharingService],
})
export class DashboardModule {}
