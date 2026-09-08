import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import {
  Connection,
  QueryHistory,
  CachedResult,
  Transformation,
  TransformationRun,
  Organization,
  User,
  FdwServer,
  SavedCrossQuery,
  SavedQuery,
  Dashboard,
  ImportJob,
  StagedData,
  DatasetShare,
  Notebook,
  Pipeline,
  PipelineRun,
  TableProfile,
  QualityCheck,
  QualityCheckRun,
} from './database/entities';
import { OrganizationSettings } from './database/entities/organization-settings.entity';
import { EncryptionModule } from './modules/encryption/encryption.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { SchemaModule } from './modules/schema/schema.module';
import { QueriesModule } from './modules/queries/queries.module';
import { TransformationsModule } from './modules/transformations/transformations.module';
import { AuthModule } from './modules/auth/auth.module';
import { CrossQueryModule } from './modules/cross-query/cross-query.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LineageModule } from './modules/lineage/lineage.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AiModule } from './modules/ai/ai.module';
import { Nl2sqlModule } from './modules/nl2sql/nl2sql.module';
import { NotebooksModule } from './modules/notebooks/notebooks.module';
import { PipelinesModule } from './modules/pipelines/pipelines.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DataQualityModule } from './modules/data-quality/data-quality.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'admin'),
        password: configService.get('DB_PASSWORD', 'admin123'),
        database: configService.get('DB_DATABASE', 'govdatahub'),
        entities: [
          Connection,
          QueryHistory,
          CachedResult,
          Transformation,
          TransformationRun,
          Organization,
          User,
          FdwServer,
          SavedCrossQuery,
          SavedQuery,
          Dashboard,
          ImportJob,
          StagedData,
          DatasetShare,
          OrganizationSettings,
          Notebook,
          Pipeline,
          PipelineRun,
          TableProfile,
          QualityCheck,
          QualityCheckRun,
        ],
        synchronize: false, // Use migrations
        logging: configService.get('NODE_ENV') === 'development',
      }),
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL', 60000),
            limit: configService.get<number>('THROTTLE_LIMIT', 30),
          },
        ],
      }),
    }),

    // Scheduling (for cleanup tasks)
    ScheduleModule.forRoot(),

    // Feature modules
    EncryptionModule,
    AuthModule,
    SettingsModule,
    AiModule,
    Nl2sqlModule,
    ConnectionsModule,
    SchemaModule,
    QueriesModule,
    TransformationsModule,
    CrossQueryModule,
    IngestionModule,
    DashboardModule,
    LineageModule,
    NotebooksModule,
    PipelinesModule,
    CatalogModule,
    DataQualityModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: authenticate first, then role-check, then throttle.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
