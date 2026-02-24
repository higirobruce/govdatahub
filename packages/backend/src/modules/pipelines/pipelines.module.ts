import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pipeline, PipelineRun, SavedCrossQuery } from '../../database/entities';
import { TransformationsModule } from '../transformations/transformations.module';
import { CrossQueryModule } from '../cross-query/cross-query.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { PipelinesService } from './pipelines.service';
import { PipelinesExecutorService } from './pipelines-executor.service';
import { PipelinesSchedulerService } from './pipelines-scheduler.service';
import { PipelinesController } from './pipelines.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pipeline, PipelineRun, SavedCrossQuery]),
    TransformationsModule,
    CrossQueryModule,
    IngestionModule,
  ],
  controllers: [PipelinesController],
  providers: [PipelinesService, PipelinesExecutorService, PipelinesSchedulerService],
})
export class PipelinesModule {}
