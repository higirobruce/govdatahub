import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('saved_dashboards')
export class SavedDashboard {
  @PrimaryColumn('text')
  id: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('jsonb')
  widgets: any[]; // ChartWidget[]

  @Column('jsonb')
  layout: any[];  // DashboardLayout[]

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
