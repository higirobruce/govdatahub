'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LineChart } from './LineChart';
import { BarChart } from './BarChart';
import { PieChart } from './PieChart';
import { BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon, Download } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface ChartConfig {
  type: 'line' | 'bar' | 'pie';
  title: string;
  data: any;
}

interface ChartBuilderProps {
  initialData?: any;
  onSave?: (config: ChartConfig) => void;
}

/**
 * Visual chart builder component
 * Allows users to create charts with a simple interface
 */
export function ChartBuilder({ initialData, onSave }: ChartBuilderProps) {
  const { showToast } = useToast();
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie'>('line');
  const [chartTitle, setChartTitle] = useState('My Chart');
  const [showArea, setShowArea] = useState(false);
  const [stacked, setStacked] = useState(false);
  const [horizontal, setHorizontal] = useState(false);
  const [donut, setDonut] = useState(false);

  // Sample data for demonstration
  const sampleLineBarData = {
    xAxis: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    series: [
      {
        name: 'Series 1',
        data: [120, 200, 150, 80, 70, 110, 130],
        color: '#60a5fa'
      },
      {
        name: 'Series 2',
        data: [90, 130, 110, 134, 90, 80, 100],
        color: '#4ade80'
      }
    ]
  };

  const samplePieData = [
    { name: 'Category A', value: 335, color: '#60a5fa' },
    { name: 'Category B', value: 310, color: '#4ade80' },
    { name: 'Category C', value: 234, color: '#fb923c' },
    { name: 'Category D', value: 135, color: '#ef4444' }
  ];

  const chartData = initialData || (chartType === 'pie' ? samplePieData : sampleLineBarData);

  const handleExport = () => {
    // Export chart as PNG (ECharts built-in feature)
    showToast('Export feature - will download chart as PNG', 'info');
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        type: chartType,
        title: chartTitle,
        data: chartData
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Chart Type Selector */}
      <div className="bg-white rounded-lg border border-[#e8e8e8] p-6">
        <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">Chart Type</h3>
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setChartType('line')}
            className={`p-4 rounded-lg border-2 transition-colors ${
              chartType === 'line'
                ? 'border-[#60a5fa] bg-[#eff6ff]'
                : 'border-[#e8e8e8] hover:border-[#d0d0d0]'
            }`}
          >
            <LineChartIcon className="w-8 h-8 mx-auto mb-2 text-[#555555]" />
            <div className="text-[13px] font-medium text-[#1a1a1a]">Line Chart</div>
          </button>

          <button
            onClick={() => setChartType('bar')}
            className={`p-4 rounded-lg border-2 transition-colors ${
              chartType === 'bar'
                ? 'border-[#4ade80] bg-[#f0fdf4]'
                : 'border-[#e8e8e8] hover:border-[#d0d0d0]'
            }`}
          >
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-[#555555]" />
            <div className="text-[13px] font-medium text-[#1a1a1a]">Bar Chart</div>
          </button>

          <button
            onClick={() => setChartType('pie')}
            className={`p-4 rounded-lg border-2 transition-colors ${
              chartType === 'pie'
                ? 'border-[#fb923c] bg-[#fff7ed]'
                : 'border-[#e8e8e8] hover:border-[#d0d0d0]'
            }`}
          >
            <PieChartIcon className="w-8 h-8 mx-auto mb-2 text-[#555555]" />
            <div className="text-[13px] font-medium text-[#1a1a1a]">Pie Chart</div>
          </button>
        </div>
      </div>

      {/* Chart Configuration */}
      <div className="bg-white rounded-lg border border-[#e8e8e8] p-6">
        <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-4">Configuration</h3>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[13px] font-medium text-[#555555] mb-2">Chart Title</label>
            <input
              type="text"
              value={chartTitle}
              onChange={(e) => setChartTitle(e.target.value)}
              className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
              placeholder="Enter chart title"
            />
          </div>

          {/* Chart-specific options */}
          {chartType === 'line' && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[13px] text-[#555555]">
                <input
                  type="checkbox"
                  checked={showArea}
                  onChange={(e) => setShowArea(e.target.checked)}
                  className="rounded"
                />
                Show Area
              </label>
            </div>
          )}

          {chartType === 'bar' && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[13px] text-[#555555]">
                <input
                  type="checkbox"
                  checked={stacked}
                  onChange={(e) => setStacked(e.target.checked)}
                  className="rounded"
                />
                Stacked
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[#555555]">
                <input
                  type="checkbox"
                  checked={horizontal}
                  onChange={(e) => setHorizontal(e.target.checked)}
                  className="rounded"
                />
                Horizontal
              </label>
            </div>
          )}

          {chartType === 'pie' && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[13px] text-[#555555]">
                <input
                  type="checkbox"
                  checked={donut}
                  onChange={(e) => setDonut(e.target.checked)}
                  className="rounded"
                />
                Donut Style
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Chart Preview */}
      <div className="bg-white rounded-lg border border-[#e8e8e8] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Preview</h3>
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export PNG
            </Button>
            {onSave && (
              <Button onClick={handleSave} size="sm">
                Save Chart
              </Button>
            )}
          </div>
        </div>

        <div className="border border-[#f0f0f0] rounded-lg p-4">
          {chartType === 'line' && (
            <LineChart
              data={chartData}
              title={chartTitle}
              showArea={showArea}
            />
          )}
          {chartType === 'bar' && (
            <BarChart
              data={chartData}
              title={chartTitle}
              stacked={stacked}
              horizontal={horizontal}
            />
          )}
          {chartType === 'pie' && (
            <PieChart
              data={chartData}
              title={chartTitle}
              donut={donut}
            />
          )}
        </div>
      </div>
    </div>
  );
}
