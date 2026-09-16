import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchProject, MatchRun, MatchEntity, MatchDecision } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([MatchProject, MatchRun, MatchEntity, MatchDecision])],
})
export class MatchingModule {}
