import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';
import { QueryTemplateService } from './query-template.service';
import { SavedQueriesController } from './saved-queries.controller';
import { SavedQueriesService } from './saved-queries.service';
import {
  QueryHistory,
  CachedResult,
  SavedQuery,
} from '../../database/entities';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QueryHistory, CachedResult, SavedQuery]),
    ConnectionsModule,
  ],
  controllers: [QueriesController, SavedQueriesController],
  providers: [QueriesService, QueryTemplateService, SavedQueriesService],
  exports: [QueriesService, QueryTemplateService, SavedQueriesService],
})
export class QueriesModule {}
