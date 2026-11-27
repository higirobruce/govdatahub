'use client';

import { BaseChart } from './BaseChart';
import { EChartsOption } from 'echarts';

export interface AreaChartData {
  xAxis: string[];
  series: {
    name: string;
    data: number[];
    color?: string;
  }[];
}

export interface AreaChartProps {
  data: AreaChartData;
  title?: string;
  height?: string;
  smooth?: boolean;
  stacked?: boolean;
  showLegend?: boolean;
  onValueClick?: (name: string) => void;
}

/**
 * Area Chart Component
 * Ideal for visualizing trends and cumulative data over time
 */
export function AreaChart({
  data,
  title,
  height = '400px',
  smooth = true,
  stacked = false,
  showLegend = true,
  onValueClick,
}: AreaChartProps) {
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
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#1a1a1a',
      },
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#555555',
        },
      },
    },
    legend: showLegend ? {
      data: data.series.map(s => s.name),
      top: title ? 35 : 10,
      textStyle: {
        color: '#555555',
      },
    } : undefined,
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: title ? (showLegend ? '80px' : '50px') : (showLegend ? '50px' : '20px'),
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.xAxis,
      axisLine: {
        lineStyle: {
          color: '#e8e8e8',
        },
      },
      axisLabel: {
        color: '#555555',
      },
    },
    yAxis: {
      type: 'value',
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
    series: data.series.map((s, index) => ({
      name: s.name,
      type: 'line',
      smooth: smooth,
      stack: stacked ? 'total' : undefined,
      data: s.data,
      itemStyle: {
        color: s.color || ['#60a5fa', '#4ade80', '#fb923c', '#a78bfa', '#ef4444'][index % 5],
      },
      areaStyle: {
        opacity: 0.6,
      },
      emphasis: {
        focus: 'series',
      },
    })),
  };

  return <BaseChart option={option} height={height} onValueClick={onValueClick} />;
}
