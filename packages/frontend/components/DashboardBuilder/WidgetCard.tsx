'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChartWidget, CrossFilter } from './types';
import { LineChart, BarChart, PieChart, ScatterChart, AreaChart, RadarChart, HeatmapChart, GaugeChart, FunnelChart, KpiCard, TableChart } from '@/components/charts';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { GripVertical, Settings, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { sqlToChartData, sqlToPieData } from '@/lib/chart-utils';

interface WidgetCardProps {
  widget: ChartWidget;
  onSelect: () => void;
  onDelete: () => void;
  isPreviewMode: boolean;
  globalFilters?: Record<string, string>;
  crossFilter?: CrossFilter | null;
  onCrossFilter?: (filter: CrossFilter) => void;
}

export function WidgetCard({ widget, onSelect, onDelete, isPreviewMode, globalFilters, crossFilter, onCrossFilter }: WidgetCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [liveData, setLiveData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchLiveData = useCallback(async () => {
    if (!widget.dataSource) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      let sql = widget.dataSource.sql;
      // Wrap with cross-filter if active
      if (crossFilter) {
        const safeCol = crossFilter.column.replace(/"/g, '');
        const safeVal = crossFilter.value.replace(/'/g, "''");
        sql = `SELECT * FROM (${sql}) AS __cf WHERE "${safeCol}" = '${safeVal}'`;
      }
      const result = await (api.queries as any).chartData({
        connectionId: widget.dataSource.connectionId,
        sql,
        xColumn: widget.dataSource.xColumn,
        yColumn: widget.dataSource.yColumn,
        groupBy: widget.dataSource.groupBy,
        filters: globalFilters,
      });
      setLiveData(result);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  }, [widget.dataSource, crossFilter, globalFilters]);

  useEffect(() => {
    if (!widget.dataSource) {
      setLiveData(null);
      setFetchError(null);
      return;
    }

    fetchLiveData();

    const interval = widget.dataSource.refreshInterval && widget.dataSource.refreshInterval > 0
      ? setInterval(fetchLiveData, widget.dataSource.refreshInterval * 1000)
      : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [widget.dataSource, fetchLiveData]);

  const getChartDataFromLive = () => {
    if (!liveData || !widget.dataSource) return null;
    const { rows } = liveData;
    if (!rows || rows.length === 0) return null;

    switch (widget.type) {
      case 'pie':
      case 'funnel': {
        const nameCol = widget.dataSource.xColumn || Object.keys(rows[0] || {})[0];
        const valCol = widget.dataSource.yColumn || Object.keys(rows[0] || {})[1] || Object.keys(rows[0] || {})[0];
        return sqlToPieData(rows, nameCol, valCol);
      }
      case 'scatter': {
        const xCol = widget.dataSource.xColumn || Object.keys(rows[0] || {})[0];
        const yCol = widget.dataSource.yColumn || Object.keys(rows[0] || {})[1] || Object.keys(rows[0] || {})[0];
        return {
          series: [{
            name: yCol,
            data: rows.map((row: any) => ({ x: Number(row[xCol]), y: Number(row[yCol]), name: String(row[xCol]) })),
            color: '#60a5fa',
          }],
        };
      }
      default: {
        const xCol = widget.dataSource.xColumn || Object.keys(rows[0] || {})[0];
        const yCol = widget.dataSource.yColumn || Object.keys(rows[0] || {})[1] || Object.keys(rows[0] || {})[0];
        return sqlToChartData(rows, xCol, yCol, widget.dataSource.groupBy);
      }
    }
  };

  const renderChart = () => {
    const height = widget.config?.height || '100%';

    // If live data source is configured, handle loading/error/data states
    if (widget.dataSource) {
      if (isLoading && !liveData) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-[#e8e8e8] border-t-[#60a5fa] rounded-full animate-spin" />
          </div>
        );
      }

      if (fetchError) {
        return (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-3">
            <div className="text-[#ef4444] text-sm">Failed to load data</div>
            <div className="text-xs text-[#aaaaaa]">{fetchError}</div>
            <button
              onClick={fetchLiveData}
              className="px-3 py-1.5 text-xs bg-[#60a5fa] text-white rounded hover:bg-[#3b82f6] transition-colors"
            >
              Retry
            </button>
          </div>
        );
      }
    }

    try {
      switch (widget.type) {
        case 'kpi': {
          const kpiVal = widget.dataSource && liveData
            ? liveData.rows?.[0]?.[widget.dataSource.yColumn || Object.keys(liveData.rows[0] || {})[0]]
            : widget.data?.value;
          return (
            <KpiCard
              value={kpiVal ?? widget.data?.value ?? 0}
              label={widget.data?.label}
              previousValue={widget.config?.previousValue}
              unit={widget.config?.unit}
              height={height}
            />
          );
        }

        case 'line': {
          const chartData = widget.dataSource && liveData ? getChartDataFromLive() : widget.data;
          if (!chartData?.xAxis || !chartData?.series) {
            throw new Error('Invalid data structure for line chart');
          }
          return <LineChart data={chartData} title="" height={height} {...widget.config} onDataPointClick={onCrossFilter ? (params) => {
            onCrossFilter({ column: widget.dataSource?.xColumn || 'value', value: String(params.name) });
          } : undefined} />;
        }

        case 'bar': {
          const chartData = widget.dataSource && liveData ? getChartDataFromLive() : widget.data;
          if (!chartData?.xAxis || !chartData?.series) {
            throw new Error('Invalid data structure for bar chart');
          }
          return <BarChart data={chartData} title="" height={height} {...widget.config} onDataPointClick={onCrossFilter ? (params) => {
            onCrossFilter({ column: widget.dataSource?.xColumn || 'value', value: String(params.name) });
          } : undefined} />;
        }

        case 'pie': {
          const chartData = widget.dataSource && liveData ? getChartDataFromLive() : widget.data;
          if (!Array.isArray(chartData)) {
            throw new Error('Invalid data structure for pie chart');
          }
          return <PieChart data={chartData} title="" height={height} {...widget.config} onDataPointClick={onCrossFilter ? (params) => {
            onCrossFilter({ column: widget.dataSource?.xColumn || 'value', value: String(params.name) });
          } : undefined} />;
        }

        case 'scatter': {
          const chartData = widget.dataSource && liveData ? getChartDataFromLive() : widget.data;
          if (!chartData?.series) {
            throw new Error('Invalid data structure for scatter chart');
          }
          return <ScatterChart series={chartData.series} title="" height={height} {...widget.config} />;
        }

        case 'area': {
          const chartData = widget.dataSource && liveData ? getChartDataFromLive() : widget.data;
          if (!chartData?.xAxis || !chartData?.series) {
            throw new Error('Invalid data structure for area chart');
          }
          return <AreaChart data={chartData} title="" height={height} {...widget.config} onDataPointClick={onCrossFilter ? (params) => {
            onCrossFilter({ column: widget.dataSource?.xColumn || 'value', value: String(params.name) });
          } : undefined} />;
        }

        case 'table': {
          const tRows = (widget.dataSource && liveData) ? liveData.rows : (widget.data?.rows ?? []);
          const tFields = (widget.dataSource && liveData) ? liveData.fields : (widget.data?.fields ?? []);
          return <TableChart rows={tRows} fields={tFields} height={height} />;
        }

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

        case 'funnel': {
          const chartData = widget.dataSource && liveData ? getChartDataFromLive() : widget.data;
          if (!Array.isArray(chartData)) {
            throw new Error('Invalid data structure for funnel chart');
          }
          return <FunnelChart data={chartData} title="" height={height} {...widget.config} />;
        }

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
          {widget.dataSource && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-[#eff6ff] text-[#3b82f6] rounded border border-[#bfdbfe]">
              live
            </span>
          )}
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
                setShowDeleteConfirm(true);
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={onDelete}
        title="Delete Chart"
        message={`Delete chart "${widget.title}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
