import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type AlertOperator = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'ne';

export interface NotificationChannel {
  type: 'email' | 'slack';
  target: string; // email address or Slack webhook URL
}

@Entity('alert_rules')
export class AlertRule {
  @PrimaryColumn('text') id: string;
  @Column('text') name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column('text', { name: 'connection_id' }) connectionId: string;
  @Column('text') sql: string;
  @Column({ type: 'float', name: 'threshold_value' }) thresholdValue: number;
  @Column('text', { name: 'threshold_operator' }) thresholdOperator: AlertOperator;
  @Column({ type: 'int', name: 'check_interval_minutes', default: 60 }) checkIntervalMinutes: number;
  @Column({ type: 'jsonb', name: 'notification_channels', default: '[]' }) notificationChannels: NotificationChannel[];
  @Column({ type: 'boolean', default: true }) enabled: boolean;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @Column({ type: 'text', name: 'created_by', nullable: true }) createdBy: string | null;
  @Column({ type: 'timestamp', name: 'last_triggered_at', nullable: true }) lastTriggeredAt: Date | null;
  @Column({ type: 'timestamp', name: 'last_checked_at', nullable: true }) lastCheckedAt: Date | null;
  @Column({ type: 'float', name: 'last_value', nullable: true }) lastValue: number | null;
  @Column({ type: 'text', name: 'last_status', nullable: true }) lastStatus: 'ok' | 'triggered' | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
