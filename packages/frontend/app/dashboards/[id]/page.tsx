'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { api, type DashboardWidget } from '@/lib/api';
import { DashboardFilterBar } from '@/components/DashboardBuilder/DashboardFilterBar';
import {
  useDashboardFilters,
  resolveBindings,
} from '@/components/DashboardBuilder/useDashboardFilters';
import { SavedQueryWidget } from '@/components/DashboardBuilder/SavedQueryWidget';

export default function DashboardViewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: dashboard, error, isLoading } = useSWR(
    id ? ['dashboard', id] : null,
    () => api.dashboards.get(id),
  );

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading dashboard…</div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load dashboard: {(error as Error).message}
      </div>
    );
  }
  if (!dashboard) {
    return null;
  }

  return <DashboardView dashboard={dashboard} />;
}

function DashboardView({
  dashboard,
}: {
  dashboard: NonNullable<ReturnType<typeof useSWR>['data']> | any;
}) {
  const { values, setValue, reset } = useDashboardFilters(dashboard.filters);

  // Cross-filter handler: clicking a data point in a widget with
  // `config.crossFilter` set updates that filter. Clicking the same value
  // twice toggles the filter off so the user can return to "no selection".
  const handleCrossFilter = (filterName: string, value: string) => {
    const current = values[filterName];
    if (current === value) {
      setValue(filterName, undefined);
    } else {
      setValue(filterName, value);
    }
  };

  // react-grid-layout expects a stable layout array; use the dashboard's
  // saved layout, falling back to a one-column stack if none was persisted.
  const layout = useMemo(
    () =>
      (dashboard.layout ?? []).length
        ? dashboard.layout
        : (dashboard.widgets ?? []).map((w: DashboardWidget, i: number) => ({
            i: w.id,
            x: 0,
            y: i * 4,
            w: 12,
            h: 4,
          })),
    [dashboard.layout, dashboard.widgets],
  );

  return (
    <div className="p-6">
      <Link
        href="/dashboards"
        className="inline-block mb-3 text-xs text-muted-foreground underline underline-offset-2"
      >
        ← All dashboards
      </Link>
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{dashboard.name}</h1>
          {dashboard.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {dashboard.description}
            </p>
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {dashboard.widgets?.length ?? 0} widgets · {dashboard.filters?.length ?? 0} filters
        </span>
      </header>

      <DashboardFilterBar
        filters={dashboard.filters ?? []}
        values={values}
        onChange={setValue}
        onReset={reset}
      />

      {(dashboard.widgets ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          No widgets on this dashboard yet
        </div>
      ) : (
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={80}
          width={1200}
          isDraggable={false}
          isResizable={false}
          margin={[12, 12]}
        >
          {(dashboard.widgets ?? []).map((widget: DashboardWidget) => {
            const params = resolveBindings(widget.parameterBindings, values);
            return (
              <div
                key={widget.id}
                className="rounded-md border bg-card overflow-hidden"
              >
                <div className="h-full w-full p-3">
                  <SavedQueryWidget
                    widget={widget}
                    parameters={params}
                    onCrossFilter={handleCrossFilter}
                  />
                </div>
              </div>
            );
          })}
        </GridLayout>
      )}
    </div>
  );
}
