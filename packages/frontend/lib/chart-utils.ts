/**
 * Chart utilities and helpers for DataGate
 */

// Standard color palette for charts
export const CHART_COLORS = {
  blue: '#60a5fa',
  green: '#4ade80',
  orange: '#fb923c',
  red: '#ef4444',
  purple: '#a78bfa',
  yellow: '#fbbf24',
  pink: '#f472b6',
  indigo: '#818cf8',
};

// Color array for multi-series charts
export const CHART_COLOR_ARRAY = [
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.orange,
  CHART_COLORS.purple,
  CHART_COLORS.yellow,
  CHART_COLORS.pink,
  CHART_COLORS.indigo,
  CHART_COLORS.red,
];

/**
 * Convert SQL query results to line/bar chart format
 */
export function sqlToChartData(
  rows: any[],
  xColumn: string,
  yColumn: string,
  groupBy?: string
): { xAxis: string[]; series: Array<{ name: string; data: number[]; color?: string }> } {
  if (!rows || rows.length === 0) {
    return { xAxis: [], series: [] };
  }

  if (!groupBy) {
    // Single series
    const xAxis = rows.map(row => String(row[xColumn]));
    const data = rows.map(row => Number(row[yColumn]));

    return {
      xAxis,
      series: [{
        name: yColumn,
        data,
        color: CHART_COLORS.blue
      }]
    };
  }

  // Multiple series (grouped)
  const groups = new Map<string, Map<string, number>>();
  const xAxisSet = new Set<string>();

  // Group data
  rows.forEach(row => {
    const xValue = String(row[xColumn]);
    const yValue = Number(row[yColumn]);
    const groupValue = String(row[groupBy]);

    xAxisSet.add(xValue);

    if (!groups.has(groupValue)) {
      groups.set(groupValue, new Map());
    }
    groups.get(groupValue)!.set(xValue, yValue);
  });

  const xAxis = Array.from(xAxisSet);
  const series = Array.from(groups.entries()).map(([groupName, dataMap], index) => ({
    name: groupName,
    data: xAxis.map(x => dataMap.get(x) || 0),
    color: CHART_COLOR_ARRAY[index % CHART_COLOR_ARRAY.length]
  }));

  return { xAxis, series };
}

/**
 * Convert SQL query results to pie chart format
 */
export function sqlToPieData(
  rows: any[],
  nameColumn: string,
  valueColumn: string
): Array<{ name: string; value: number; color?: string }> {
  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((row, index) => ({
    name: String(row[nameColumn]),
    value: Number(row[valueColumn]),
    color: CHART_COLOR_ARRAY[index % CHART_COLOR_ARRAY.length]
  }));
}

/**
 * Export chart as PNG
 */
export function exportChartAsPNG(chart: any, filename: string = 'chart.png') {
  const url = chart.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: '#ffffff'
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
}

/**
 * Format number with abbreviations (K, M, B)
 */
export function formatNumber(value: number): string {
  if (value >= 1e9) {
    return (value / 1e9).toFixed(1) + 'B';
  }
  if (value >= 1e6) {
    return (value / 1e6).toFixed(1) + 'M';
  }
  if (value >= 1e3) {
    return (value / 1e3).toFixed(1) + 'K';
  }
  return value.toFixed(0);
}

/**
 * Common ECharts theme for DataGate
 */
export const DATA_GATE_THEME = {
  color: CHART_COLOR_ARRAY,
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#555555'
  },
  title: {
    textStyle: {
      color: '#1a1a1a',
      fontWeight: 600
    }
  },
  legend: {
    textStyle: {
      color: '#555555'
    }
  },
  tooltip: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: '#e8e8e8',
    borderWidth: 1,
    textStyle: {
      color: '#1a1a1a'
    }
  }
};

/**
 * Aggregate data by time period
 */
export function aggregateByTimePeriod(
  data: Array<{ date: Date | string; value: number }>,
  period: 'hour' | 'day' | 'week' | 'month'
): Array<{ date: string; value: number }> {
  const aggregated = new Map<string, number>();

  data.forEach(({ date, value }) => {
    const d = new Date(date);
    let key: string;

    switch (period) {
      case 'hour':
        key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:00`;
        break;
      case 'day':
        key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        break;
      case 'week':
        const week = Math.floor(d.getDate() / 7);
        key = `${d.getFullYear()}-${d.getMonth() + 1} Week ${week}`;
        break;
      case 'month':
        key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        break;
    }

    aggregated.set(key, (aggregated.get(key) || 0) + value);
  });

  return Array.from(aggregated.entries()).map(([date, value]) => ({
    date,
    value
  }));
}

/**
 * Calculate moving average
 */
export function movingAverage(data: number[], windowSize: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = data.slice(start, i + 1);
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    result.push(avg);
  }

  return result;
}
