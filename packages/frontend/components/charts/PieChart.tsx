'use client';

import { BaseChart } from './BaseChart';
import type { EChartsOption } from 'echarts';

interface PieChartProps {
  data: {
    name: string;
    value: number;
    color?: string;
  }[];
  title?: string;
  height?: string;
  donut?: boolean;
  onDataPointClick?: (params: any) => void;
}

/**
 * Pie chart component for proportional data visualization
 */
export function PieChart({ data, title, height = '400px', donut = false, onDataPointClick }: PieChartProps) {
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
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#1a1a1a'
      }
    },
    legend: {
      bottom: 0,
      left: 'center',
      textStyle: {
        color: '#555555'
      }
    },
    series: [
      {
        name: title || 'Data',
        type: 'pie',
        radius: donut ? ['40%', '70%'] : '70%',
        center: ['50%', '45%'],
        data: data.map(item => ({
          name: item.name,
          value: item.value,
          itemStyle: item.color ? { color: item.color } : undefined
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.2)'
          }
        },
        label: {
          formatter: '{b}: {d}%',
          color: '#555555'
        }
      }
    ]
  };

  return <BaseChart option={option} height={height} onDataPointClick={onDataPointClick} />;
}
