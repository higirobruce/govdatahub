import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Connection,
  ImportJob,
  StagedData,
  Transformation,
  TransformationRun,
  SavedCrossQuery,
  DatasetShare,
} from '../../database/entities';
import { LineageController } from './lineage.controller';
import { LineageBuilderService } from './lineage-builder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Connection,
      ImportJob,
      StagedData,
      Transformation,
      TransformationRun,
      SavedCrossQuery,
      DatasetShare,
    ]),
  ],
  controllers: [LineageController],
  providers: [LineageBuilderService],
  exports: [LineageBuilderService],
})
export class LineageModule {}
