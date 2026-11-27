import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Per-widget config blob. Kept loosely typed at the DB layer because
 * widget config shapes vary by chart type and evolve with the frontend.
 * The controller's DTO performs shallow shape validation.
 */
export interface DashboardWidgetConfig {
  id: string;
  type: string;
  title?: string;
  savedQueryId?: string;
  parameterBindings?: Record<string, string>;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DashboardFilterType =
  | 'date_range'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'text'
  | 'number';

/**
 * A dashboard filter is a named control rendered above the grid.
 * Widgets reference filters by name via `parameterBindings` to flow
 * the runtime value into their saved-query parameters.
 */
export interface DashboardFilterDef {
  name: string;
  type: DashboardFilterType;
  label?: string;
  default?: unknown;
  options?: string[];
}

@Entity('dashboards')
export class Dashboard {
  @PrimaryColumn('text')
  id: string;

  @Column('text', { name: 'organization_id' })
  organizationId: string;

  @Column('text', { name: 'created_by' })
  createdBy: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  description: string | null;

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  widgets: DashboardWidgetConfig[];

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  layout: DashboardLayoutItem[];

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  filters: DashboardFilterDef[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
