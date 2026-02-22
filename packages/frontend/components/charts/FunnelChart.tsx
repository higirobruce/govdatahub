'use client';

import { BaseChart } from './BaseChart';
import { EChartsOption } from 'echarts';

export interface FunnelDataPoint {
  name: string;
  value: number;
}

export interface FunnelChartProps {
  data: FunnelDataPoint[];
  title?: string;
  height?: string;
  sort?: 'ascending' | 'descending' | 'none';
  showLabel?: boolean;
}

/**
 * Funnel Chart Component
 * Ideal for conversion rates, sales funnels, and multi-stage processes
 */
export function FunnelChart({
  data,
  title,
  height = '400px',
  sort = 'descending',
  showLabel = true,
}: FunnelChartProps) {
  const colors = ['#60a5fa', '#4ade80', '#fb923c', '#a78bfa', '#ef4444', '#fbbf24'];

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
        const percentage = params.percent;
        return `
          <strong>${params.name}</strong><br/>
          Value: ${params.value.toLocaleString()}<br/>
          Percentage: ${percentage}%
        `;
      },
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: title ? 50 : 20,
      textStyle: {
        color: '#555555',
      },
    },
    series: [
      {
        name: 'Funnel',
        type: 'funnel',
        left: '25%',
        right: '10%',
        top: title ? 60 : 30,
        bottom: 60,
        width: '60%',
        sort: sort,
        gap: 2,
        label: {
          show: showLabel,
          position: 'inside',
          color: '#fff',
          fontSize: 14,
          fontWeight: 'bold',
          formatter: '{b}: {c}',
        },
        labelLine: {
          length: 10,
          lineStyle: {
            width: 1,
            type: 'solid',
          },
        },
        itemStyle: {
          borderColor: '#fff',
          borderWidth: 2,
        },
        emphasis: {
          label: {
            fontSize: 16,
          },
        },
        data: data.map((item, index) => ({
          value: item.value,
          name: item.name,
          itemStyle: {
            color: colors[index % colors.length],
          },
        })),
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
