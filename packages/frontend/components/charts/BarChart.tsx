'use client';

import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface BarChartProps {
  data: {
    xAxis: string[];
    series: {
      name: string;
      data: number[];
      color?: string;
    }[];
  };
  title?: string;
  height?: string;
  horizontal?: boolean;
  stacked?: boolean;
}

/**
 * Bar chart component for categorical comparisons
 */
export function BarChart({ data, title, height = '400px', horizontal = false, stacked = false }: BarChartProps) {
  const option: EChartsOption = {
    title: title ? {
      text: title,
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 600,
        color: '#1a1a1a'
      }
    } : undefined,
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#1a1a1a'
      }
    },
    legend: {
      data: data.series.map(s => s.name),
      bottom: 0,
      textStyle: {
        color: '#555555'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: title ? '15%' : '5%',
      containLabel: true
    },
    [horizontal ? 'yAxis' : 'xAxis']: {
      type: 'category',
      data: data.xAxis,
      axisLine: {
        lineStyle: {
          color: '#e8e8e8'
        }
      },
      axisLabel: {
        color: '#555555'
      }
    },
    [horizontal ? 'xAxis' : 'yAxis']: {
      type: 'value',
      axisLine: {
        lineStyle: {
          color: '#e8e8e8'
        }
      },
      axisLabel: {
        color: '#555555'
      },
      splitLine: {
        lineStyle: {
          color: '#f0f0f0'
        }
      }
    },
    series: data.series.map(s => ({
      name: s.name,
      type: 'bar',
      stack: stacked ? 'total' : undefined,
      data: s.data,
      itemStyle: {
        color: s.color || undefined
      },
      emphasis: {
        focus: 'series'
      }
    }))
  };

  return <BaseChart option={option} height={height} />;
}
