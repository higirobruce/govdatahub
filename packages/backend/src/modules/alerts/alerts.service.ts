import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertRule, AlertEvent, AlertOperator } from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

function thresholdPasses(value: number, threshold: number, op: AlertOperator): boolean {
  switch (op) {
    case 'gt': return value > threshold;
    case 'lt': return value < threshold;
    case 'eq': return value === threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'ne': return value !== threshold;
  }
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly queryTimeoutMs = 30000;

  constructor(
    @InjectRepository(AlertRule)
    private alertRuleRepository: Repository<AlertRule>,
    @InjectRepository(AlertEvent)
    private alertEventRepository: Repository<AlertEvent>,
    private connectionsService: ConnectionsService,
  ) {}

  async createRule(dto: CreateAlertRuleDto, userId: string | null, orgId: string): Promise<AlertRule> {
    const rule = this.alertRuleRepository.create({
      id: crypto.randomUUID(),
      name: dto.name,
      description: dto.description ?? null,
      connectionId: dto.connectionId,
      sql: dto.sql,
      thresholdValue: dto.thresholdValue,
      thresholdOperator: dto.thresholdOperator,
      checkIntervalMinutes: dto.checkIntervalMinutes ?? 60,
      notificationChannels: dto.notificationChannels ?? [],
      enabled: dto.enabled ?? true,
      organizationId: orgId,
      createdBy: userId,
      lastTriggeredAt: null,
      lastCheckedAt: null,
      lastValue: null,
      lastStatus: null,
    });
    return this.alertRuleRepository.save(rule);
  }

  async findAll(orgId: string): Promise<(AlertRule & { recentEvents: AlertEvent[] })[]> {
    const rules = await this.alertRuleRepository.find({
      where: { organizationId: orgId },
      order: { createdAt: 'DESC' },
    });

    const enriched = await Promise.all(
      rules.map(async (rule) => {
        const recentEvents = await this.alertEventRepository.find({
          where: { ruleId: rule.id, organizationId: orgId },
          order: { createdAt: 'DESC' },
          take: 3,
        });
        return Object.assign(rule, { recentEvents });
      }),
    );

    return enriched;
  }

  async findOne(id: string, orgId: string): Promise<AlertRule> {
    const rule = await this.alertRuleRepository.findOne({ where: { id, organizationId: orgId } });
    if (!rule) {
      throw new NotFoundException(`Alert rule ${id} not found`);
    }
    return rule;
  }

  async updateRule(id: string, dto: UpdateAlertRuleDto, orgId: string): Promise<AlertRule> {
    const rule = await this.findOne(id, orgId);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description ?? null;
    if (dto.connectionId !== undefined) rule.connectionId = dto.connectionId;
    if (dto.sql !== undefined) rule.sql = dto.sql;
    if (dto.thresholdValue !== undefined) rule.thresholdValue = dto.thresholdValue;
    if (dto.thresholdOperator !== undefined) rule.thresholdOperator = dto.thresholdOperator;
    if (dto.checkIntervalMinutes !== undefined) rule.checkIntervalMinutes = dto.checkIntervalMinutes;
    if (dto.notificationChannels !== undefined) rule.notificationChannels = dto.notificationChannels;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;

    return this.alertRuleRepository.save(rule);
  }

  async removeRule(id: string, orgId: string): Promise<void> {
    const rule = await this.findOne(id, orgId);
    await this.alertRuleRepository.remove(rule);
  }

  async getEvents(ruleId: string, orgId: string, limit = 50): Promise<AlertEvent[]> {
    // Verify rule belongs to org
    await this.findOne(ruleId, orgId);

    return this.alertEventRepository.find({
      where: { ruleId, organizationId: orgId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async evaluateRule(rule: AlertRule): Promise<void> {
    let driver: any;
    try {
      driver = await this.connectionsService.getDriver(rule.connectionId, rule.organizationId);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Alert query timeout')), this.queryTimeoutMs),
      );

      const result = await Promise.race([driver.query(rule.sql), timeoutPromise]);

      const rows: any[] = result.rows ?? (Array.isArray(result) ? result : []);
      if (rows.length === 0) {
        this.logger.warn(`Alert rule ${rule.id} returned no rows — skipping evaluation`);
        rule.lastCheckedAt = new Date();
        await this.alertRuleRepository.save(rule);
        return;
      }

      const firstRow = rows[0];
      const rawValue = Object.values(firstRow)[0];
      const value = parseFloat(String(rawValue));

      if (isNaN(value)) {
        this.logger.warn(`Alert rule ${rule.id} first column is not numeric: ${rawValue}`);
        rule.lastCheckedAt = new Date();
        await this.alertRuleRepository.save(rule);
        return;
      }

      const triggered = thresholdPasses(value, rule.thresholdValue, rule.thresholdOperator);
      const prevStatus = rule.lastStatus;

      rule.lastCheckedAt = new Date();
      rule.lastValue = value;

      if (triggered) {
        rule.lastStatus = 'triggered';
        if (prevStatus !== 'triggered') {
          rule.lastTriggeredAt = new Date();
          const event = this.alertEventRepository.create({
            id: crypto.randomUUID(),
            ruleId: rule.id,
            value,
            status: 'triggered',
            message: `Value ${value} ${rule.thresholdOperator} ${rule.thresholdValue}`,
            organizationId: rule.organizationId,
          });
          await this.alertEventRepository.save(event);
          await this.sendNotification(rule, event);
        }
      } else {
        rule.lastStatus = 'ok';
        if (prevStatus === 'triggered') {
          const event = this.alertEventRepository.create({
            id: crypto.randomUUID(),
            ruleId: rule.id,
            value,
            status: 'resolved',
            message: `Value ${value} no longer meets threshold condition`,
            organizationId: rule.organizationId,
          });
          await this.alertEventRepository.save(event);
        }
      }

      await this.alertRuleRepository.save(rule);
    } finally {
      if (driver) {
        try { await driver.disconnect(); } catch (_) { /* ignore */ }
      }
    }
  }

  async evaluateAll(): Promise<void> {
    const rules = await this.alertRuleRepository.find({ where: { enabled: true } });
    const now = Date.now();

    for (const rule of rules) {
      const needsCheck =
        !rule.lastCheckedAt ||
        now - rule.lastCheckedAt.getTime() >= rule.checkIntervalMinutes * 60 * 1000;

      if (!needsCheck) continue;

      try {
        await this.evaluateRule(rule);
      } catch (err) {
        this.logger.error(`Failed to evaluate alert rule ${rule.id} (${rule.name}): ${err?.message}`);
      }
    }
  }

  private async sendNotification(rule: AlertRule, event: AlertEvent): Promise<void> {
    const text =
      `[ALERT] "${rule.name}" triggered\n` +
      `Value: ${event.value} (threshold: ${rule.thresholdOperator} ${rule.thresholdValue})\n` +
      `Rule ID: ${rule.id}`;

    for (const channel of rule.notificationChannels) {
      if (channel.type === 'slack') {
        try {
          await fetch(channel.target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
        } catch (err) {
          this.logger.error(`Slack notification failed for rule ${rule.id}: ${err?.message}`);
        }
      } else if (channel.type === 'email') {
        this.logger.warn(
          `Email notifications require SMTP configuration (SMTP_HOST env var) — skipping email to ${channel.target} for rule ${rule.id}`,
        );
      }
    }
  }
}
