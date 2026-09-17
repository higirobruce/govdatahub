import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchProject, MatchRun, MatchEntity, MatchDecision, MatchGoldPair, StagedData } from '../../database/entities';
import { NormalizationService } from './normalization.service';
import { SourceReaderService } from './sources/source-reader.service';
import { MaterializeService } from './materialize.service';
import { BlockingService } from './blocking.service';
import { ScoringService } from './scoring.service';
import { ClusteringService } from './clustering.service';
import { CrosswalkService } from './crosswalk.service';
import { EvalService } from './eval.service';
import { MatchingCleanupService } from './matching-cleanup.service';
import { MatchRunService } from './match-run.service';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { ConnectionsModule } from '../connections/connections.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchProject, MatchRun, MatchEntity, MatchDecision, MatchGoldPair, StagedData]),
    ConnectionsModule,
    SettingsModule,
  ],
  controllers: [MatchingController],
  providers: [
    NormalizationService,
    SourceReaderService,
    MaterializeService,
    BlockingService,
    ScoringService,
    ClusteringService,
    CrosswalkService,
    EvalService,
    MatchingCleanupService,
    MatchRunService,
    MatchingService,
  ],
  exports: [MatchRunService],
})
export class MatchingModule {}
