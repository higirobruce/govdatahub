'use client';

import { BaseChart } from './BaseChart';
import { EChartsOption } from 'echarts';

export interface RadarIndicator {
  name: string;
  max: number;
  min?: number;
}

export interface RadarSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface RadarChartProps {
  indicators: RadarIndicator[];
  series: RadarSeries[];
  title?: string;
  height?: string;
  showLegend?: boolean;
}

/**
 * Radar Chart Component
 * Perfect for multi-dimensional comparisons and performance metrics
 */
export function RadarChart({
  indicators,
  series,
  title,
  height = '400px',
  showLegend = true,
}: RadarChartProps) {
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
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#1a1a1a',
      },
    },
    legend: showLegend ? {
      data: series.map(s => s.name),
      top: title ? 35 : 10,
      textStyle: {
        color: '#555555',
      },
    } : undefined,
    radar: {
      indicator: indicators,
      shape: 'polygon',
      splitNumber: 5,
      center: ['50%', '55%'],
      radius: '60%',
      axisName: {
        color: '#555555',
        fontSize: 12,
      },
      splitLine: {
        lineStyle: {
          color: '#e8e8e8',
        },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(96, 165, 250, 0.05)', 'rgba(96, 165, 250, 0.1)'],
        },
      },
    },
    series: [
      {
        type: 'radar',
        data: series.map((s, index) => ({
          value: s.data,
          name: s.name,
          itemStyle: {
            color: s.color || ['#60a5fa', '#4ade80', '#fb923c', '#a78bfa', '#ef4444'][index % 5],
          },
          areaStyle: {
            opacity: 0.3,
          },
        })),
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
