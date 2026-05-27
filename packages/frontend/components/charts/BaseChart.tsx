'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface BaseChartProps {
  option: EChartsOption;
  height?: string;
  className?: string;
  onChartReady?: (chart: echarts.ECharts) => void;
  /**
   * Fires when the user clicks a data point (bar, slice, marker).
   * The argument is the category/name string (params.name from ECharts).
   * Use for cross-filter behavior — see SavedQueryWidget.
   */
  onValueClick?: (name: string) => void;
}

/**
 * Base chart component using Apache ECharts
 * Provides a foundation for all chart types
 */
export function BaseChart({
  option,
  height = '400px',
  className = '',
  onChartReady,
  onValueClick,
}: BaseChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  // Keep the latest handler in a ref so the chart effect doesn't re-init
  // on every parent re-render that produces a new function identity.
  const clickHandlerRef = useRef<typeof onValueClick>(onValueClick);
  useEffect(() => {
    clickHandlerRef.current = onValueClick;
  }, [onValueClick]);

  useEffect(() => {
    if (!chartRef.current) return;

    // Initialize chart
    const chart = echarts.init(chartRef.current);
    chartInstanceRef.current = chart;

    // Set option
    chart.setOption(option);

    // Forward click events. ECharts gives us { name, value, dataIndex, ... }.
    // We use `name` since it matches the x-axis category (bar/line/area) or
    // the slice label (pie). Pointer is set via the cursor style below.
    chart.on('click', (params: { name?: string }) => {
      const fn = clickHandlerRef.current;
      if (fn && typeof params.name === 'string') {
        fn(params.name);
      }
    });

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
      chart.dispose();
    };
  }, [option, onChartReady]);

  // Update chart when option changes
  useEffect(() => {
    if (chartInstanceRef.current) {
      chartInstanceRef.current.setOption(option, true);
    }
  }, [option]);

  return (
    <div
      ref={chartRef}
      style={{ height, cursor: onValueClick ? 'pointer' : undefined }}
      className={className}
    />
  );
}
