'use client';

import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface LineChartProps {
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
  smooth?: boolean;
  showArea?: boolean;
}

/**
 * Line chart component for time-series and trend data
 */
export function LineChart({ data, title, height = '400px', smooth = true, showArea = false }: LineChartProps) {
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
    xAxis: {
      type: 'category',
      boundaryGap: false,
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
    yAxis: {
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
      type: 'line',
      smooth: smooth,
      data: s.data,
      itemStyle: {
        color: s.color || undefined
      },
      areaStyle: showArea ? {
        opacity: 0.1
      } : undefined,
      emphasis: {
        focus: 'series'
      }
    }))
  };

  return <BaseChart option={option} height={height} />;
}
