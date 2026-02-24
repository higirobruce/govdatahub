import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Transformation,
  TransformationRun,
  CachedResult,
} from '../../database/entities';
import { ConnectionsModule } from '../connections/connections.module';
import { TransformationsService } from './transformations.service';
import { TransformationsController } from './transformations.controller';
import { TransformationsExecutorService } from './transformations-executor.service';
import { TransformationsCleanupService } from './transformations-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transformation, TransformationRun, CachedResult]),
    ConnectionsModule, // For getDriver() access
  ],
  controllers: [TransformationsController],
  providers: [
    TransformationsService,
    TransformationsExecutorService,
    TransformationsCleanupService,
  ],
  exports: [TransformationsService, TransformationsExecutorService],
})
export class TransformationsModule {}
