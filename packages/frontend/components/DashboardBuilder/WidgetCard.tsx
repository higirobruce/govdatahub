'use client';

import { ChartWidget } from './types';
import { LineChart, BarChart, PieChart, ScatterChart, AreaChart, RadarChart, HeatmapChart, GaugeChart, FunnelChart } from '@/components/charts';
import { GripVertical, Settings, Trash2 } from 'lucide-react';

interface WidgetCardProps {
  widget: ChartWidget;
  onSelect: () => void;
  onDelete: () => void;
  isPreviewMode: boolean;
}

export function WidgetCard({ widget, onSelect, onDelete, isPreviewMode }: WidgetCardProps) {
  const renderChart = () => {
    const height = widget.config?.height || '100%';

    try {
      switch (widget.type) {
        case 'line':
          if (!widget.data?.xAxis || !widget.data?.series) {
            throw new Error('Invalid data structure for line chart');
          }
          return <LineChart data={widget.data} title="" height={height} {...widget.config} />;

        case 'bar':
          if (!widget.data?.xAxis || !widget.data?.series) {
            throw new Error('Invalid data structure for bar chart');
          }
          return <BarChart data={widget.data} title="" height={height} {...widget.config} />;

        case 'pie':
          if (!Array.isArray(widget.data)) {
            throw new Error('Invalid data structure for pie chart');
          }
          return <PieChart data={widget.data} title="" height={height} {...widget.config} />;

        case 'scatter':
          if (!widget.data?.series) {
            throw new Error('Invalid data structure for scatter chart');
          }
          return <ScatterChart series={widget.data.series} title="" height={height} {...widget.config} />;

        case 'area':
          if (!widget.data?.xAxis || !widget.data?.series) {
            throw new Error('Invalid data structure for area chart');
          }
          return <AreaChart data={widget.data} title="" height={height} {...widget.config} />;

        case 'radar':
          if (!widget.data?.indicators || !widget.data?.series) {
            throw new Error('Invalid data structure for radar chart');
          }
          return <RadarChart indicators={widget.data.indicators} series={widget.data.series} title="" height={height} {...widget.config} />;

        case 'heatmap':
          if (!widget.data?.data || !widget.data?.xAxisLabels || !widget.data?.yAxisLabels) {
            throw new Error('Invalid data structure for heatmap');
          }
          return <HeatmapChart data={widget.data.data} xAxisLabels={widget.data.xAxisLabels} yAxisLabels={widget.data.yAxisLabels} title="" height={height} {...widget.config} />;

        case 'gauge':
          if (typeof widget.data?.value !== 'number') {
            throw new Error('Invalid data structure for gauge chart');
          }
          return <GaugeChart value={widget.data.value} title="" height={height} {...widget.config} />;

        case 'funnel':
          if (!Array.isArray(widget.data)) {
            throw new Error('Invalid data structure for funnel chart');
          }
          return <FunnelChart data={widget.data} title="" height={height} {...widget.config} />;

        default:
          return <div className="flex items-center justify-center h-full text-[#aaaaaa]">Unknown chart type</div>;
      }
    } catch (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <div className="text-[#ef4444] mb-2">⚠️ Chart Error</div>
          <div className="text-xs text-[#aaaaaa]">
            {error instanceof Error ? error.message : 'Failed to render chart'}
          </div>
          <button
            onClick={onSelect}
            className="mt-3 px-3 py-1.5 text-xs bg-[#60a5fa] text-white rounded hover:bg-[#3b82f6] transition-colors"
          >
            Reconfigure Chart
          </button>
        </div>
      );
    }
  };

  return (
    <div className="h-full w-full bg-white rounded-lg border-2 border-[#e8e8e8] shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
      {/* Widget Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#f5f5f5] border-b border-[#e8e8e8]">
        <div className="flex items-center gap-2 flex-1">
          {!isPreviewMode && (
            <div className="drag-handle cursor-move p-1 hover:bg-[#e8e8e8] rounded transition-colors" title="Drag to move">
              <GripVertical className="w-4 h-4 text-[#aaaaaa]" />
            </div>
          )}
          <h3 className="text-[14px] font-semibold text-[#1a1a1a] truncate">
            {widget.title}
          </h3>
        </div>

        {!isPreviewMode && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSelect();
              }}
              className="p-1.5 hover:bg-[#e8e8e8] rounded transition-colors"
              title="Configure chart"
            >
              <Settings className="w-4 h-4 text-[#555555]" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (confirm('Delete this chart?')) {
                  onDelete();
                }
              }}
              className="p-1.5 hover:bg-[#fee2e2] rounded transition-colors"
              title="Delete chart"
            >
              <Trash2 className="w-4 h-4 text-[#ef4444]" />
            </button>
          </div>
        )}
      </div>

      {/* Widget Content */}
      <div className="flex-1 p-4 overflow-hidden">
        {renderChart()}
      </div>
    </div>
  );
}
