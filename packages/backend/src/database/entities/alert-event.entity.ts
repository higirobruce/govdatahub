import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('alert_events')
export class AlertEvent {
  @PrimaryColumn('text') id: string;
  @Column('text', { name: 'rule_id' }) ruleId: string;
  @Column({ type: 'float' }) value: number;
  @Column('text') status: 'triggered' | 'resolved';
  @Column({ type: 'text', nullable: true }) message: string | null;
  @Column('text', { name: 'organization_id' }) organizationId: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
