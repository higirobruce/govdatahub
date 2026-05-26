import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
} from '../../database/entities';
import { SavedDashboard } from '../../database/entities/saved-dashboard.entity';
import { DashboardController } from './dashboard.controller';
import { PublicDatasetController } from './public-dataset.controller';
import { SavedDashboardsController } from './saved-dashboards.controller';
import { PublicDashboardsController } from './public-dashboards.controller';
import { DatasetCatalogService } from './dataset-catalog.service';
import { DatasetSharingService } from './dataset-sharing.service';
import { SavedDashboardsService } from './saved-dashboards.service';
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
      SavedDashboard,
    ]),
    ConnectionsModule,
    EncryptionModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [DashboardController, PublicDatasetController, SavedDashboardsController, PublicDashboardsController],
  providers: [DatasetCatalogService, DatasetSharingService, SavedDashboardsService],
  exports: [DatasetCatalogService, DatasetSharingService, SavedDashboardsService],
})
export class DashboardModule {}
