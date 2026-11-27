'use client';

import { useState, useEffect } from 'react';
import { ChartWidget, ChartType, DataSource } from './types';
import { Button } from '@/components/ui/button';
import { X, BarChart3, LineChart as LineIcon, PieChart as PieIcon, ScatterChart as ScatterIcon, Activity, Target, Grid3x3, Gauge, TrendingDown, Hash, Table2 } from 'lucide-react';

interface ChartConfigPanelProps {
  widget: ChartWidget;
  onUpdate: (widget: ChartWidget) => void;
  onClose: () => void;
}

const chartTypeIcons: Record<ChartType, any> = {
  bar: BarChart3,
  line: LineIcon,
  pie: PieIcon,
  scatter: ScatterIcon,
  area: Activity,
  radar: Target,
  heatmap: Grid3x3,
  gauge: Gauge,
  funnel: TrendingDown,
  kpi: Hash,
  table: Table2,
};

const chartTypeLabels: Record<ChartType, string> = {
  bar: 'Bar Chart',
  line: 'Line Chart',
  pie: 'Pie Chart',
  scatter: 'Scatter Plot',
  area: 'Area Chart',
  radar: 'Radar Chart',
  heatmap: 'Heatmap',
  gauge: 'Gauge',
  funnel: 'Funnel',
  kpi: 'KPI Card',
  table: 'Data Table',
};

export function ChartConfigPanel({ widget, onUpdate, onClose }: ChartConfigPanelProps) {
  const [title, setTitle] = useState(widget.title);
  const [chartType, setChartType] = useState<ChartType>(widget.type);
  const [showLegend, setShowLegend] = useState(widget.config?.showLegend ?? true);
  const [smooth, setSmooth] = useState(widget.config?.smooth ?? false);
  const [stacked, setStacked] = useState(widget.config?.stacked ?? false);

  // Data source state
  const [enableDataSource, setEnableDataSource] = useState(!!widget.dataSource);
  const [connectionId, setConnectionId] = useState(widget.dataSource?.connectionId ?? '');
  const [sql, setSql] = useState(widget.dataSource?.sql ?? '');
  const [xColumn, setXColumn] = useState(widget.dataSource?.xColumn ?? '');
  const [yColumn, setYColumn] = useState(widget.dataSource?.yColumn ?? '');
  const [groupBy, setGroupBy] = useState(widget.dataSource?.groupBy ?? '');
  const [refreshInterval, setRefreshInterval] = useState<number>(widget.dataSource?.refreshInterval ?? 0);

  useEffect(() => {
    setTitle(widget.title);
    setChartType(widget.type);
    setShowLegend(widget.config?.showLegend ?? true);
    setSmooth(widget.config?.smooth ?? false);
    setStacked(widget.config?.stacked ?? false);
    setEnableDataSource(!!widget.dataSource);
    setConnectionId(widget.dataSource?.connectionId ?? '');
    setSql(widget.dataSource?.sql ?? '');
    setXColumn(widget.dataSource?.xColumn ?? '');
    setYColumn(widget.dataSource?.yColumn ?? '');
    setGroupBy(widget.dataSource?.groupBy ?? '');
    setRefreshInterval(widget.dataSource?.refreshInterval ?? 0);
  }, [widget]);

  const transformDataForChartType = (type: ChartType, currentData: any) => {
    // If chart type hasn't changed, keep existing data
    if (type === widget.type) return currentData;

    // Default data structures for each chart type
    const sampleXAxis = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const sampleValues = [120, 200, 150, 80, 70];

    switch (type) {
      case 'bar':
      case 'line':
      case 'area':
        return {
          xAxis: sampleXAxis,
          series: [{
            name: 'Sample Data',
            data: sampleValues,
            color: '#60a5fa',
          }],
        };

      case 'pie':
      case 'funnel':
        return sampleXAxis.map((label, i) => ({
          name: label,
          value: sampleValues[i],
        }));

      case 'scatter':
        return {
          series: [{
            name: 'Sample Data',
            data: sampleValues.map((val, i) => ({
              x: i * 10,
              y: val,
              name: sampleXAxis[i],
            })),
            color: '#a78bfa',
          }],
        };

      case 'radar':
        return {
          indicators: sampleXAxis.map(label => ({
            name: label,
            max: 250,
          })),
          series: [{
            name: 'Sample Data',
            data: sampleValues,
            color: '#ef4444',
          }],
        };

      case 'heatmap':
        return {
          data: Array.from({ length: 25 }, (_, i) => ({
            x: i % 5,
            y: Math.floor(i / 5),
            value: Math.floor(Math.random() * 100),
          })),
          xAxisLabels: sampleXAxis,
          yAxisLabels: sampleXAxis,
        };

      case 'gauge':
        return {
          value: 75,
          min: 0,
          max: 100,
          unit: '%',
        };

      case 'kpi':
        return { value: 0, label: 'Metric' };

      case 'table':
        return { rows: [], fields: [] };

      default:
        return currentData;
    }
  };

  const handleSave = () => {
    const transformedData = transformDataForChartType(chartType, widget.data);

    let dataSource: DataSource | undefined = undefined;
    if (enableDataSource && connectionId && sql) {
      dataSource = {
        connectionId,
        sql,
        xColumn: xColumn || undefined,
        yColumn: yColumn || undefined,
        groupBy: groupBy || undefined,
        refreshInterval,
      };
    }

    const updatedWidget: ChartWidget = {
      ...widget,
      title,
      type: chartType,
      data: transformedData,
      dataSource,
      config: {
        ...widget.config,
        showLegend,
        smooth,
        stacked,
      },
    };
    onUpdate(updatedWidget);
  };

  const chartTypes: ChartType[] = ['bar', 'line', 'pie', 'scatter', 'area', 'radar', 'heatmap', 'gauge', 'funnel', 'kpi', 'table'];

  return (
    <div className="w-80 bg-white border-l border-[#e8e8e8] shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8e8]">
        <h3 className="font-semibold text-[#1a1a1a]">Chart Settings</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#f0f0f0] rounded transition-colors"
        >
          <X className="w-4 h-4 text-[#555555]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Chart Title */}
        <div>
          <label className="block text-sm font-medium text-[#555555] mb-2">
            Chart Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-[#e8e8e8] rounded-md text-[14px] focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
            placeholder="Enter chart title..."
          />
        </div>

        {/* Chart Type */}
        <div>
          <label className="block text-sm font-medium text-[#555555] mb-3">
            Chart Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {chartTypes.map((type) => {
              const Icon = chartTypeIcons[type];
              return (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    chartType === type
                      ? 'border-[#60a5fa] bg-[#eff6ff]'
                      : 'border-[#e8e8e8] hover:border-[#d0d0d0]'
                  }`}
                  title={chartTypeLabels[type]}
                >
                  <Icon className="w-5 h-5 mx-auto mb-1 text-[#555555]" />
                  <div className="text-[10px] text-[#555555] text-center truncate">
                    {type}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart Options */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-[#555555] mb-2">
            Options
          </label>

          {/* Show Legend */}
          {['bar', 'line', 'area', 'radar'].includes(chartType) && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showLegend}
                onChange={(e) => setShowLegend(e.target.checked)}
                className="w-4 h-4 text-[#60a5fa] border-[#e8e8e8] rounded focus:ring-[#60a5fa]"
              />
              <span className="text-sm text-[#1a1a1a]">Show Legend</span>
            </label>
          )}

          {/* Smooth Lines */}
          {['line', 'area'].includes(chartType) && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={smooth}
                onChange={(e) => setSmooth(e.target.checked)}
                className="w-4 h-4 text-[#60a5fa] border-[#e8e8e8] rounded focus:ring-[#60a5fa]"
              />
              <span className="text-sm text-[#1a1a1a]">Smooth Curves</span>
            </label>
          )}

          {/* Stacked */}
          {['bar', 'area'].includes(chartType) && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={stacked}
                onChange={(e) => setStacked(e.target.checked)}
                className="w-4 h-4 text-[#60a5fa] border-[#e8e8e8] rounded focus:ring-[#60a5fa]"
              />
              <span className="text-sm text-[#1a1a1a]">Stacked</span>
            </label>
          )}
        </div>

        {/* Live Data Source */}
        {chartType !== 'heatmap' && chartType !== 'radar' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-[#555555]">
                Live Data Source
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableDataSource}
                  onChange={(e) => setEnableDataSource(e.target.checked)}
                  className="w-4 h-4 text-[#60a5fa] border-[#e8e8e8] rounded focus:ring-[#60a5fa]"
                />
                <span className="text-sm text-[#1a1a1a]">Enable</span>
              </label>
            </div>

            {enableDataSource && (
              <div className="space-y-3 p-3 border border-[#e8e8e8] rounded-lg bg-[#fafafa]">
                <div>
                  <label className="block text-xs font-medium text-[#555555] mb-1">
                    Connection ID
                  </label>
                  <input
                    type="text"
                    value={connectionId}
                    onChange={(e) => setConnectionId(e.target.value)}
                    className="w-full px-2 py-1.5 border border-[#e8e8e8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                    placeholder="Connection UUID"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#555555] mb-1">
                    SQL Query
                  </label>
                  <textarea
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    rows={4}
                    className="w-full px-2 py-1.5 border border-[#e8e8e8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#60a5fa] resize-none font-mono"
                    placeholder="SELECT count(*) FROM users"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#555555] mb-1">
                    X-Axis Column <span className="text-[#aaaaaa]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full px-2 py-1.5 border border-[#e8e8e8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                    placeholder="column name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#555555] mb-1">
                    Y-Axis / Value Column <span className="text-[#aaaaaa]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    className="w-full px-2 py-1.5 border border-[#e8e8e8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                    placeholder="column name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#555555] mb-1">
                    Group By <span className="text-[#aaaaaa]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value)}
                    className="w-full px-2 py-1.5 border border-[#e8e8e8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                    placeholder="column name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#555555] mb-1">
                    Refresh Interval
                  </label>
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border border-[#e8e8e8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#60a5fa] bg-white"
                  >
                    <option value={0}>Never (0)</option>
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                    <option value={300}>5min (300)</option>
                    <option value={900}>15min (900)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data Configuration Hint */}
        <div className="bg-[#eff6ff] border border-[#60a5fa] rounded-lg p-3">
          <p className="text-xs text-[#1e40af]">
            Tip: Connect this chart to live query results or datasets for real-time updates.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[#e8e8e8] p-4 space-y-2">
        <Button onClick={handleSave} className="w-full">
          Apply Changes
        </Button>
        <Button onClick={onClose} variant="outline" className="w-full">
          Cancel
        </Button>
      </div>
    </div>
  );
}
