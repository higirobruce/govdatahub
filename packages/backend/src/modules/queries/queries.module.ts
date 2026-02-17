import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';
import { QueryHistory, CachedResult } from '../../database/entities';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QueryHistory, CachedResult]),
    ConnectionsModule,
  ],
  controllers: [QueriesController],
  providers: [QueriesService],
})
export class QueriesModule {}
