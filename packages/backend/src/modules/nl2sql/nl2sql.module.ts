import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Connection } from '../../database/entities/connection.entity';
import { Nl2sqlController } from './nl2sql.controller';
import { Nl2sqlService } from './nl2sql.service';
import { SchemaContextBuilderService } from './schema-context-builder.service';
import { SqlValidatorService } from './sql-validator.service';
import { AiModule } from '../ai/ai.module';
import { SettingsModule } from '../settings/settings.module';
import { SchemaModule } from '../schema/schema.module';
import { QueriesModule } from '../queries/queries.module';

/**
 * NL2SQL Module
 *
 * Provides natural language to SQL conversion functionality.
 *
 * Features:
 * - Natural language query to SQL conversion
 * - SQL explanation in natural language
 * - SQL validation and safety checks
 * - Schema context building
 * - Optional auto-execution
 *
 * Dependencies:
 * - AiModule: AI provider abstraction
 * - SettingsModule: Organization settings
 * - SchemaModule: Database schema discovery
 * - QueriesModule: Query execution
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Connection]),
    AiModule,
    SettingsModule,
    SchemaModule,
    QueriesModule,
  ],
  controllers: [Nl2sqlController],
  providers: [
    Nl2sqlService,
    SchemaContextBuilderService,
    SqlValidatorService,
  ],
  exports: [Nl2sqlService, SqlValidatorService],
})
export class Nl2sqlModule {}
