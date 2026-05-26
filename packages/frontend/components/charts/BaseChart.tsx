'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface BaseChartProps {
  option: EChartsOption;
  height?: string;
  className?: string;
  onChartReady?: (chart: echarts.ECharts) => void;
  onDataPointClick?: (params: any) => void;
}

/**
 * Base chart component using Apache ECharts
 * Provides a foundation for all chart types
 */
export function BaseChart({ option, height = '400px', className = '', onChartReady, onDataPointClick }: BaseChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart
    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    // Set option
    chart.setOption(option);

    // Register click handler
    if (onDataPointClick) {
      chart.on('click', onDataPointClick);
    }

    // Notify parent component
    if (onChartReady) {
      onChartReady(chart);
    }

    // Handle resize
    const handleResize = () => {
      chart.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.off('click');
      chart.dispose();
    };
  }, [option, onChartReady, onDataPointClick]);

  // Update chart when option changes
  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.setOption(option, true);
    }
  }, [option]);

  return <div ref={chartRef} style={{ height }} className={className} />;
}
