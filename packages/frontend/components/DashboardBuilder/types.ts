export type ChartType = 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'radar' | 'heatmap' | 'gauge' | 'funnel';

export interface ChartWidget {
  id: string;
  type: ChartType;
  title: string;
  data: any; // Chart-specific data
  config?: {
    showLegend?: boolean;
    height?: string;
    smooth?: boolean;
    stacked?: boolean;
    [key: string]: any;
  };
}

export interface DashboardLayout {
  i: string; // Widget ID
  x: number; // Grid position X
  y: number; // Grid position Y
  w: number; // Width in grid units
  h: number; // Height in grid units
  minW?: number; // Minimum width
  minH?: number; // Minimum height
  maxW?: number; // Maximum width
  maxH?: number; // Maximum height
  static?: boolean; // If true, widget cannot be moved or resized
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
