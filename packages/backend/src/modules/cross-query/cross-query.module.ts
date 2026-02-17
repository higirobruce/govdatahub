import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FdwServer, SavedCrossQuery } from '../../database/entities';
import { ConnectionsModule } from '../connections/connections.module';
import { FdwManagerService } from './fdw-manager.service';
import { QueryBuilderService } from './query-builder.service';
import { CrossQueryExecutorService } from './cross-query-executor.service';
import { CrossQueryController } from './cross-query.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FdwServer, SavedCrossQuery]),
    ConnectionsModule,
  ],
  controllers: [CrossQueryController],
  providers: [
    FdwManagerService,
    QueryBuilderService,
    CrossQueryExecutorService,
  ],
  exports: [FdwManagerService, CrossQueryExecutorService],
})
export class CrossQueryModule {}
