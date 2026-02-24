import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TableProfile, QualityCheck, QualityCheckRun } from '../../database/entities';
import { ConnectionsModule } from '../connections/connections.module';
import { ProfilingService } from './profiling.service';
import { QualityChecksService } from './quality-checks.service';
import { DataQualityController } from './data-quality.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TableProfile, QualityCheck, QualityCheckRun]),
    ConnectionsModule,
  ],
  controllers: [DataQualityController],
  providers: [ProfilingService, QualityChecksService],
  exports: [ProfilingService, QualityChecksService],
})
export class DataQualityModule {}
