import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertRule, AlertEvent } from '../../database/entities';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsScheduler } from './alerts.scheduler';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertRule, AlertEvent]),
    ConnectionsModule,
  ],
  providers: [AlertsService, AlertsScheduler],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
