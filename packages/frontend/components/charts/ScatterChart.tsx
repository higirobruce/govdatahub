'use client';

import { BaseChart } from './BaseChart';
import { EChartsOption } from 'echarts';

export interface ScatterDataPoint {
  x: number;
  y: number;
  name?: string;
  value?: number;
}

export interface ScatterSeries {
  name: string;
  data: ScatterDataPoint[];
  color?: string;
  symbolSize?: number | ((value: number[]) => number);
}

export interface ScatterChartProps {
  series: ScatterSeries[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: string;
  showLegend?: boolean;
}

/**
 * Scatter Chart Component
 * Perfect for correlation analysis and distribution visualization
 */
export function ScatterChart({
  series,
  title,
  xAxisLabel,
  yAxisLabel,
  height = '400px',
  showLegend = true,
}: ScatterChartProps) {
  const option: EChartsOption = {
    title: title ? {
      text: title,
      left: 'center',
      textStyle: {
        color: '#1a1a1a',
        fontSize: 16,
        fontWeight: 600,
      },
    } : undefined,
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#1a1a1a',
      },
      formatter: (params: any) => {
        const point = params.data;
        return `
          <strong>${params.seriesName}</strong><br/>
          ${xAxisLabel || 'X'}: ${point[0]}<br/>
          ${yAxisLabel || 'Y'}: ${point[1]}
          ${point.name ? `<br/>${point.name}` : ''}
        `;
      },
    },
    legend: showLegend ? {
      data: series.map(s => s.name),
      top: title ? 35 : 10,
      textStyle: {
        color: '#555555',
      },
    } : undefined,
    grid: {
      left: '10%',
      right: '10%',
      bottom: '15%',
      top: title ? (showLegend ? '80px' : '50px') : (showLegend ? '50px' : '20px'),
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      name: xAxisLabel,
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: {
        color: '#555555',
        fontSize: 12,
      },
      axisLine: {
        lineStyle: {
          color: '#e8e8e8',
        },
      },
      axisLabel: {
        color: '#555555',
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
        },
      },
    },
    yAxis: {
      type: 'value',
      name: yAxisLabel,
      nameLocation: 'middle',
      nameGap: 50,
      nameTextStyle: {
        color: '#555555',
        fontSize: 12,
      },
      axisLine: {
        lineStyle: {
          color: '#e8e8e8',
        },
      },
      axisLabel: {
        color: '#555555',
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0',
        },
      },
    },
    series: series.map(s => ({
      name: s.name,
      type: 'scatter',
      data: s.data.map(point => [point.x, point.y, point.value, point.name]),
      symbolSize: s.symbolSize || 10,
      itemStyle: {
        color: s.color || '#60a5fa',
        opacity: 0.8,
      },
      emphasis: {
        itemStyle: {
          opacity: 1,
          borderColor: '#1a1a1a',
          borderWidth: 2,
        },
      },
    })),
  };

  return <BaseChart option={option} height={height} />;
}
