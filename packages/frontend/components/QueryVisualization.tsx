'use client';

import { useState, useMemo } from 'react';
import { QueryResult } from '@/types';
import { LineChart, BarChart, PieChart } from '@/components/charts';
import { sqlToChartData, sqlToPieData } from '@/lib/chart-utils';
import { Button } from '@/components/ui/button';
import { X, BarChart3, LineChart as LineIcon, PieChart as PieIcon } from 'lucide-react';

interface QueryVisualizationProps {
  queryResult: QueryResult;
  onClose: () => void;
}

/**
 * Query visualization component
 * Allows users to instantly visualize their SQL query results
 */
export function QueryVisualization({ queryResult, onClose }: QueryVisualizationProps) {
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie'>('bar');
  const [xColumn, setXColumn] = useState<string>('');
  const [yColumn, setYColumn] = useState<string>('');
  const [groupBy, setGroupBy] = useState<string>('');

  // Get column names from query results
  const columns = queryResult.columns || [];
  const rows = queryResult.rows || [];

  // Auto-select columns on first render
  useMemo(() => {
    if (columns.length > 0 && !xColumn) {
      setXColumn(columns[0]);
    }
    if (columns.length > 1 && !yColumn) {
      // Try to find a numeric column
      const numericCol = columns.find(col => {
        const firstValue = rows[0]?.[col];
        return typeof firstValue === 'number';
      });
      setYColumn(numericCol || columns[1]);
    }
  }, [columns, rows, xColumn, yColumn]);

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!xColumn || !yColumn || rows.length === 0) {
      return chartType === 'pie'
        ? []
        : { xAxis: [], series: [] };
    }

    try {
      if (chartType === 'pie') {
        return sqlToPieData(rows, xColumn, yColumn);
      } else {
        return sqlToChartData(rows, xColumn, yColumn, groupBy || undefined);
      }
    } catch (error) {
      console.error('Error preparing chart data:', error);
      return chartType === 'pie'
        ? []
        : { xAxis: [], series: [] };
    }
  }, [chartType, xColumn, yColumn, groupBy, rows]);

  const hasData = chartType === 'pie'
    ? Array.isArray(chartData) && chartData.length > 0
    : chartData.xAxis && chartData.xAxis.length > 0;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e8]">
          <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Visualize Query Results</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#f0f0f0] rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-[#555555]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Chart Type Selector */}
          <div>
            <label className="block text-sm font-medium text-[#555555] mb-3">Chart Type</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setChartType('bar')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  chartType === 'bar'
                    ? 'border-[#4ade80] bg-[#f0fdf4]'
                    : 'border-[#e8e8e8] hover:border-[#d0d0d0]'
                }`}
              >
                <BarChart3 className="w-6 h-6 mx-auto mb-1 text-[#555555]" />
                <div className="text-[13px] font-medium text-[#1a1a1a]">Bar Chart</div>
              </button>

              <button
                onClick={() => setChartType('line')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  chartType === 'line'
                    ? 'border-[#60a5fa] bg-[#eff6ff]'
                    : 'border-[#e8e8e8] hover:border-[#d0d0d0]'
                }`}
              >
                <LineIcon className="w-6 h-6 mx-auto mb-1 text-[#555555]" />
                <div className="text-[13px] font-medium text-[#1a1a1a]">Line Chart</div>
              </button>

              <button
                onClick={() => setChartType('pie')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  chartType === 'pie'
                    ? 'border-[#fb923c] bg-[#fff7ed]'
                    : 'border-[#e8e8e8] hover:border-[#d0d0d0]'
                }`}
              >
                <PieIcon className="w-6 h-6 mx-auto mb-1 text-[#555555]" />
                <div className="text-[13px] font-medium text-[#1a1a1a]">Pie Chart</div>
              </button>
            </div>
          </div>

          {/* Column Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                {chartType === 'pie' ? 'Label Column' : 'X-Axis Column'}
              </label>
              <select
                value={xColumn}
                onChange={(e) => setXColumn(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
              >
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                {chartType === 'pie' ? 'Value Column' : 'Y-Axis Column'}
              </label>
              <select
                value={yColumn}
                onChange={(e) => setYColumn(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
              >
                {columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>

            {chartType !== 'pie' && (
              <div>
                <label className="block text-sm font-medium text-[#555555] mb-2">
                  Group By (Optional)
                </label>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                >
                  <option value="">-- None --</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Chart Preview */}
          <div className="border border-[#e8e8e8] rounded-lg p-6 bg-[#fafafa]">
            {!hasData ? (
              <div className="text-center text-[#aaaaaa] py-12">
                Select columns to visualize your data
              </div>
            ) : (
              <>
                {chartType === 'line' && (
                  <LineChart
                    data={chartData as any}
                    title="Query Results"
                    height="400px"
                  />
                )}
                {chartType === 'bar' && (
                  <BarChart
                    data={chartData as any}
                    title="Query Results"
                    height="400px"
                  />
                )}
                {chartType === 'pie' && (
                  <PieChart
                    data={chartData as any}
                    title="Query Results"
                    height="400px"
                    donut={true}
                  />
                )}
              </>
            )}
          </div>

          {/* Data Info */}
          <div className="text-sm text-[#aaaaaa] text-center">
            Showing {rows.length} rows from your query results
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#e8e8e8] bg-[#fafafa]">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
