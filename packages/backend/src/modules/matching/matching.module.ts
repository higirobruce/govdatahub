import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchProject, MatchRun, MatchEntity, MatchDecision } from '../../database/entities';
import { NormalizationService } from './normalization.service';

@Module({
  imports: [TypeOrmModule.forFeature([MatchProject, MatchRun, MatchEntity, MatchDecision])],
  providers: [NormalizationService],
})
export class MatchingModule {}
