'use client';

import { useCallback } from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import { ChartWidget, DashboardLayout, CrossFilter } from './types';
import { WidgetCard } from './WidgetCard';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface DashboardGridProps {
  widgets: ChartWidget[];
  layout: DashboardLayout[];
  onLayoutChange: (layout: DashboardLayout[]) => void;
  onSelectWidget: (widget: ChartWidget) => void;
  onDeleteWidget: (widgetId: string) => void;
  isPreviewMode: boolean;
  globalFilters?: Record<string, string>;
  crossFilter?: CrossFilter | null;
  onCrossFilter?: (filter: CrossFilter) => void;
}

export function DashboardGrid({
  widgets,
  layout,
  onLayoutChange,
  onSelectWidget,
  onDeleteWidget,
  isPreviewMode,
  globalFilters,
  crossFilter,
  onCrossFilter,
}: DashboardGridProps) {
  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    const mappedLayout: DashboardLayout[] = newLayout.map(item => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH,
      static: item.static,
    }));
    onLayoutChange(mappedLayout);
  }, [onLayoutChange]);

  return (
    <div className="bg-[#fafafa] rounded-xl border border-[#e8e8e8] p-6 min-h-[600px]">
      <GridLayout
        className="layout"
        layout={layout as Layout[]}
        cols={12}
        rowHeight={80}
        width={1200}
        isDraggable={!isPreviewMode}
        isResizable={!isPreviewMode}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".drag-handle"
        compactType="vertical"
        preventCollision={false}
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            <WidgetCard
              widget={widget}
              onSelect={() => onSelectWidget(widget)}
              onDelete={() => onDeleteWidget(widget.id)}
              isPreviewMode={isPreviewMode}
              globalFilters={globalFilters}
              crossFilter={crossFilter}
              onCrossFilter={onCrossFilter}
            />
          </div>
        ))}
      </GridLayout>

      {/* Grid overlay for visual guidance */}
      {!isPreviewMode && widgets.length > 0 && (
        <div className="text-xs text-[#aaaaaa] text-center mt-4">
          💡 Drag charts by their header • Resize from corners • Click to configure
        </div>
      )}
    </div>
  );
}
