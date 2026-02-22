'use client';

import { BaseChart } from './BaseChart';
import { EChartsOption } from 'echarts';

export interface GaugeChartProps {
  value: number;
  title?: string;
  min?: number;
  max?: number;
  unit?: string;
  height?: string;
  thresholds?: {
    low: number;
    medium: number;
    high: number;
  };
}

/**
 * Gauge Chart Component
 * Perfect for KPIs, performance metrics, and progress indicators
 */
export function GaugeChart({
  value,
  title,
  min = 0,
  max = 100,
  unit = '%',
  height = '400px',
  thresholds = { low: 33, medium: 66, high: 100 },
}: GaugeChartProps) {
  // Determine color based on value and thresholds
  const getColor = (val: number) => {
    const percentage = ((val - min) / (max - min)) * 100;
    if (percentage <= thresholds.low) return '#ef4444'; // Red
    if (percentage <= thresholds.medium) return '#fb923c'; // Orange
    if (percentage <= thresholds.high) return '#4ade80'; // Green
    return '#60a5fa'; // Blue (excellent)
  };

  const option: EChartsOption = {
    title: title ? {
      text: title,
      left: 'center',
      top: '10px',
      textStyle: {
        color: '#1a1a1a',
        fontSize: 16,
        fontWeight: 600,
      },
    } : undefined,
    series: [
      {
        type: 'gauge',
        min: min,
        max: max,
        startAngle: 200,
        endAngle: -20,
        center: ['50%', '60%'],
        radius: '75%',
        splitNumber: 10,
        axisLine: {
          lineStyle: {
            width: 20,
            color: [
              [thresholds.low / 100, '#ef4444'],
              [thresholds.medium / 100, '#fb923c'],
              [thresholds.high / 100, '#4ade80'],
              [1, '#60a5fa'],
            ],
          },
        },
        pointer: {
          itemStyle: {
            color: '#1a1a1a',
          },
          width: 6,
          length: '70%',
        },
        axisTick: {
          distance: -20,
          length: 8,
          lineStyle: {
            color: '#fff',
            width: 2,
          },
        },
        splitLine: {
          distance: -20,
          length: 15,
          lineStyle: {
            color: '#fff',
            width: 3,
          },
        },
        axisLabel: {
          distance: 20,
          color: '#555555',
          fontSize: 12,
        },
        detail: {
          valueAnimation: true,
          formatter: `{value}${unit}`,
          color: getColor(value),
          fontSize: 32,
          fontWeight: 'bold',
          offsetCenter: [0, '80%'],
        },
        data: [
          {
            value: value,
          },
        ],
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
