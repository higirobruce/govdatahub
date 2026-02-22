'use client';

import { BaseChart } from './BaseChart';
import { EChartsOption } from 'echarts';

export interface HeatmapDataPoint {
  x: number;
  y: number;
  value: number;
}

export interface HeatmapChartProps {
  data: HeatmapDataPoint[];
  xAxisLabels: string[];
  yAxisLabels: string[];
  title?: string;
  height?: string;
  colorRange?: [string, string];
  showValues?: boolean;
}

/**
 * Heatmap Chart Component
 * Ideal for visualizing matrix data, correlations, and density patterns
 */
export function HeatmapChart({
  data,
  xAxisLabels,
  yAxisLabels,
  title,
  height = '400px',
  colorRange = ['#eff6ff', '#1e40af'],
  showValues = false,
}: HeatmapChartProps) {
  // Find min and max values for color scale
  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

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
      position: 'top',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      textStyle: {
        color: '#1a1a1a',
      },
      formatter: (params: any) => {
        return `
          <strong>${xAxisLabels[params.data[0]]} × ${yAxisLabels[params.data[1]]}</strong><br/>
          Value: ${params.data[2]}
        `;
      },
    },
    grid: {
      height: '70%',
      top: title ? '60px' : '30px',
      left: '15%',
      right: '10%',
    },
    xAxis: {
      type: 'category',
      data: xAxisLabels,
      splitArea: {
        show: true,
      },
      axisLabel: {
        color: '#555555',
        rotate: xAxisLabels.length > 10 ? 45 : 0,
      },
    },
    yAxis: {
      type: 'category',
      data: yAxisLabels,
      splitArea: {
        show: true,
      },
      axisLabel: {
        color: '#555555',
      },
    },
    visualMap: {
      min: min,
      max: max,
      calculable: true,
      orient: 'vertical',
      right: '5%',
      top: 'center',
      inRange: {
        color: colorRange,
      },
      textStyle: {
        color: '#555555',
      },
    },
    series: [
      {
        name: 'Heatmap',
        type: 'heatmap',
        data: data.map(d => [d.x, d.y, d.value]),
        label: {
          show: showValues,
          color: '#1a1a1a',
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };

  return <BaseChart option={option} height={height} />;
}
