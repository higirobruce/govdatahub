import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchProject, MatchRun, MatchEntity, MatchDecision, StagedData } from '../../database/entities';
import { NormalizationService } from './normalization.service';
import { SourceReaderService } from './sources/source-reader.service';
import { MaterializeService } from './materialize.service';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MatchProject, MatchRun, MatchEntity, MatchDecision, StagedData]),
    ConnectionsModule,
  ],
  providers: [NormalizationService, SourceReaderService, MaterializeService],
})
export class MatchingModule {}
