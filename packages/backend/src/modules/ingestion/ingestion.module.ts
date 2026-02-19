import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportJob, StagedData } from '../../database/entities';
import { ConnectionsModule } from '../connections/connections.module';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { CsvParserService } from './parsers/csv-parser.service';
import { ExcelParserService } from './parsers/excel-parser.service';
import { JsonParserService } from './parsers/json-parser.service';
import { StagingImporterService } from './importers/staging-importer.service';
import { DatabaseImporterService } from './importers/database-importer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJob, StagedData]),
    ConnectionsModule, // For database importer
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    CsvParserService,
    ExcelParserService,
    JsonParserService,
    StagingImporterService,
    DatabaseImporterService,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
