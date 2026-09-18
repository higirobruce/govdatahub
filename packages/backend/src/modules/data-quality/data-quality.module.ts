import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TableProfile, QualityCheck, QualityCheckRun } from '../../database/entities';
import { ConnectionsModule } from '../connections/connections.module';
import { AiModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { MatchingModule } from '../matching/matching.module';
import { ProfilingService } from './profiling.service';
import { QualityChecksService } from './quality-checks.service';
import { DataQualityController } from './data-quality.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TableProfile, QualityCheck, QualityCheckRun]),
    ConnectionsModule,
    AiModule,
    SettingsModule,
    // Read-only MatchProject/MatchRun/MatchEntity repositories, for the
    // no_duplicates check. See matching.module.ts — MatchRunService is
    // never exported from there, so it can't leak in here either.
    MatchingModule,
  ],
  controllers: [DataQualityController],
  providers: [ProfilingService, QualityChecksService],
  exports: [ProfilingService, QualityChecksService],
})
export class DataQualityModule {}
