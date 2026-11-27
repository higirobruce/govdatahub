import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';

@Injectable()
export class AlertsScheduler {
  private readonly logger = new Logger(AlertsScheduler.name);

  constructor(private readonly alertsService: AlertsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAlertChecks() {
    try {
      await this.alertsService.evaluateAll();
    } catch (err) {
      this.logger.error('Alert evaluation cycle failed', err?.message);
    }
  }
}
