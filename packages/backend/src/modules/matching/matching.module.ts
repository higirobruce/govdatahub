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
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchProject, MatchRun, MatchEntity, MatchDecision, MatchGoldPair, StagedData]),
    ConnectionsModule,
  ],
  providers: [
    NormalizationService,
    SourceReaderService,
    MaterializeService,
    BlockingService,
    ScoringService,
    ClusteringService,
    CrosswalkService,
    EvalService,
  ],
})
export class MatchingModule {}
