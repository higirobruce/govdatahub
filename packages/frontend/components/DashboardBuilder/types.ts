export type ChartType = 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'radar' | 'heatmap' | 'gauge' | 'funnel' | 'kpi';

export interface DataSource {
  connectionId: string;
  sql: string;
  xColumn?: string;
  yColumn?: string;
  groupBy?: string;
  refreshInterval?: number; // seconds; 0 = never auto-refresh
}

export interface ChartWidget {
  id: string;
  type: ChartType;
  title: string;
  data: any;
  dataSource?: DataSource; // if set, widget fetches live data from the backend
  config?: {
    showLegend?: boolean;
    height?: string;
    smooth?: boolean;
    stacked?: boolean;
    unit?: string;
    previousValue?: number;
    [key: string]: any;
  };
}

export interface DashboardLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
}

export interface Dashboard {
  id?: string;
  name: string;
  description?: string;
  widgets: ChartWidget[];
  layout: DashboardLayout[];
  createdAt: string;
  updatedAt?: string;
}
