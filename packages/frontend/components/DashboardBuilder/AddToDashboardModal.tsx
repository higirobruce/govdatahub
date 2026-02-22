'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Plus, LayoutDashboard } from 'lucide-react';
import { QueryResult } from '@/types';
import { ChartType } from './types';
import { sqlToChartData, sqlToPieData } from '@/lib/chart-utils';

interface AddToDashboardModalProps {
  queryResult: QueryResult;
  onClose: () => void;
  onAdd: (chartConfig: any) => void;
}

export function AddToDashboardModal({ queryResult, onClose, onAdd }: AddToDashboardModalProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [chartTitle, setChartTitle] = useState('Query Results Chart');
  const [xColumn, setXColumn] = useState('');
  const [yColumn, setYColumn] = useState('');

  const columns = queryResult.fields?.map(f => f.name) || [];
  const rows = queryResult.rows || [];

  // Auto-select first column for X and first numeric for Y
  useState(() => {
    if (columns.length > 0 && !xColumn) {
      setXColumn(columns[0]);
    }
    if (columns.length > 1 && !yColumn) {
      const numericCol = columns.find((col: string) => {
        const firstValue = rows[0]?.[col];
        return typeof firstValue === 'number';
      });
      setYColumn(numericCol || columns[1]);
    }
  });

  const handleAddToDashboard = () => {
    let chartData;

    // Transform query results to chart data format
    switch (chartType) {
      case 'bar':
      case 'line':
      case 'area':
        chartData = sqlToChartData(rows, xColumn, yColumn);
        break;

      case 'pie':
      case 'funnel':
        chartData = sqlToPieData(rows, xColumn, yColumn);
        break;

      case 'scatter':
        chartData = {
          series: [{
            name: yColumn,
            data: rows.map((row: any) => ({
              x: typeof row[xColumn] === 'number' ? row[xColumn] : 0,
              y: typeof row[yColumn] === 'number' ? row[yColumn] : 0,
              name: String(row[xColumn]),
            })),
            color: '#60a5fa',
          }],
        };
        break;

      case 'radar':
        if (columns.length >= 3) {
          chartData = {
            indicators: columns.slice(1).map(col => ({
              name: col,
              max: Math.max(...rows.map((r: any) => typeof r[col] === 'number' ? r[col] : 0)) * 1.2,
            })),
            series: rows.slice(0, 3).map((row: any, index: number) => ({
              name: String(row[xColumn]),
              data: columns.slice(1).map(col => typeof row[col] === 'number' ? row[col] : 0),
              color: ['#60a5fa', '#4ade80', '#fb923c'][index % 3],
            })),
          };
        }
        break;

      case 'gauge':
        // Use first numeric value
        const firstNumericValue = rows[0]?.[yColumn];
        chartData = {
          value: typeof firstNumericValue === 'number' ? firstNumericValue : 0,
          min: 0,
          max: 100,
          unit: '',
        };
        break;

      case 'heatmap':
        // Create heatmap from first 25 data points
        const heatmapData = rows.slice(0, 25).map((row: any, i: number) => ({
          x: i % 5,
          y: Math.floor(i / 5),
          value: typeof row[yColumn] === 'number' ? row[yColumn] : 0,
        }));
        chartData = {
          data: heatmapData,
          xAxisLabels: ['A', 'B', 'C', 'D', 'E'],
          yAxisLabels: ['1', '2', '3', '4', '5'],
        };
        break;

      default:
        chartData = sqlToChartData(rows, xColumn, yColumn);
    }

    const chartConfig = {
      type: chartType,
      title: chartTitle,
      data: chartData,
      dataSource: {
        type: 'query',
        sql: queryResult.id, // Store query ID for future refresh
        timestamp: new Date().toISOString(),
      },
    };

    onAdd(chartConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e8]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#eff6ff] rounded-lg flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-[#60a5fa]" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold text-[#1a1a1a]">Add to Dashboard</h2>
              <p className="text-sm text-[#aaaaaa]">Create a chart from query results</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#f0f0f0] rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-[#555555]" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Chart Title */}
          <div>
            <label className="block text-sm font-medium text-[#555555] mb-2">
              Chart Title
            </label>
            <input
              type="text"
              value={chartTitle}
              onChange={(e) => setChartTitle(e.target.value)}
              className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
              placeholder="Enter chart title..."
            />
          </div>

          {/* Chart Type */}
          <div>
            <label className="block text-sm font-medium text-[#555555] mb-2">
              Chart Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['bar', 'line', 'pie', 'area'] as ChartType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`p-3 rounded-lg border-2 transition-colors capitalize ${
                    chartType === type
                      ? 'border-[#60a5fa] bg-[#eff6ff] text-[#1a1a1a]'
                      : 'border-[#e8e8e8] hover:border-[#d0d0d0] text-[#555555]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Column Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                X-Axis / Label Column
              </label>
              <select
                value={xColumn}
                onChange={(e) => setXColumn(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
              >
                {columns.map((col: string) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                Y-Axis / Value Column
              </label>
              <select
                value={yColumn}
                onChange={(e) => setYColumn(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
              >
                {columns.map((col: string) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Data Preview */}
          <div className="bg-[#fafafa] border border-[#e8e8e8] rounded-lg p-4">
            <div className="text-sm text-[#555555] mb-2">Data Preview</div>
            <div className="text-xs text-[#aaaaaa]">
              {queryResult.rowCount} rows • {columns.length} columns
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#e8e8e8] bg-[#fafafa]">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleAddToDashboard} className="gap-2">
            <Plus className="w-4 h-4" />
            Add to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
