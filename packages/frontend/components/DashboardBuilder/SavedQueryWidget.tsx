'use client';

import useSWR from 'swr';
import { api, type DashboardWidget, type SavedQueryExecuteResult } from '@/lib/api';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { PieChart } from '@/components/charts/PieChart';
import { AreaChart } from '@/components/charts/AreaChart';

interface Props {
  widget: DashboardWidget;
  parameters: Record<string, unknown>;
  /**
   * Fired when the user clicks a data point and the widget has
   * `config.crossFilter` set. The dashboard route maps this to a
   * setValue on the filter named `config.crossFilter`.
   */
  onCrossFilter?: (filterName: string, value: string) => void;
}

export function SavedQueryWidget({ widget, parameters, onCrossFilter }: Props) {
  const swrKey = widget.savedQueryId
    ? ['saved-query-execute', widget.savedQueryId, stableKey(parameters)]
    : null;

  const { data, error, isLoading } = useSWR(
    swrKey,
    () => api.savedQueries.execute(widget.savedQueryId!, parameters),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const title = widget.title ?? widget.savedQueryId;

  if (!widget.savedQueryId) {
    return <Placeholder>No saved query bound</Placeholder>;
  }
  if (error) {
    return <Placeholder error>{describeError(error)}</Placeholder>;
  }
  if (isLoading || !data) {
    return <Placeholder>Loading…</Placeholder>;
  }
  if (data.rowCount === 0) {
    return <Placeholder>No rows</Placeholder>;
  }

  const crossFilterName =
    typeof widget.config?.crossFilter === 'string'
      ? widget.config.crossFilter
      : undefined;

  const onValueClick =
    crossFilterName && onCrossFilter
      ? (value: string) => onCrossFilter(crossFilterName, value)
      : undefined;

  return renderChart(widget.type, data, title, widget.config, onValueClick);
}

function renderChart(
  type: string,
  result: SavedQueryExecuteResult,
  title: string | undefined,
  config?: Record<string, unknown>,
  onValueClick?: (name: string) => void,
) {
  const { rows, fields } = result;
  const cfg = (config ?? {}) as { xField?: string; yField?: string };

  switch (type) {
    case 'bar':
    case 'line':
    case 'area': {
      const xField = cfg.xField ?? fields[0]?.name;
      const yField = cfg.yField ?? firstNumericField(rows, fields, xField);
      if (!xField || !yField) {
        return <Placeholder error>Could not infer x/y columns</Placeholder>;
      }
      const data = {
        xAxis: rows.map((r) => String(r[xField] ?? '')),
        series: [
          {
            name: yField,
            data: rows.map((r) => Number(r[yField] ?? 0)),
          },
        ],
      };
      if (type === 'bar') return <BarChart data={data} title={title} height="100%" onValueClick={onValueClick} />;
      if (type === 'line') return <LineChart data={data} title={title} height="100%" onValueClick={onValueClick} />;
      return <AreaChart data={data} title={title} height="100%" onValueClick={onValueClick} />;
    }

    case 'pie': {
      const nameField = cfg.xField ?? fields[0]?.name;
      const valueField =
        cfg.yField ?? firstNumericField(rows, fields, nameField);
      if (!nameField || !valueField) {
        return (
          <Placeholder error>Could not infer name/value columns</Placeholder>
        );
      }
      const data = rows.map((r) => ({
        name: String(r[nameField] ?? ''),
        value: Number(r[valueField] ?? 0),
      }));
      return <PieChart data={data} title={title} height="100%" onValueClick={onValueClick} />;
    }

    default:
      return (
        <Placeholder error>
          Chart type &quot;{type}&quot; is not yet supported by SavedQueryWidget
        </Placeholder>
      );
  }
}

function firstNumericField(
  rows: Record<string, unknown>[],
  fields: { name: string }[],
  exclude?: string,
): string | undefined {
  if (rows.length === 0) return undefined;
  const first = rows[0];
  for (const f of fields) {
    if (f.name === exclude) continue;
    if (typeof first[f.name] === 'number') return f.name;
    if (!isNaN(Number(first[f.name]))) return f.name;
  }
  return undefined;
}

function stableKey(obj: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = obj[k];
        return acc;
      }, {}),
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Failed to load';
}

function Placeholder({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={
        'flex h-full w-full items-center justify-center rounded-md border border-dashed p-4 text-sm ' +
        (error
          ? 'border-destructive/40 bg-destructive/5 text-destructive'
          : 'border-muted text-muted-foreground')
      }
    >
      {children}
    </div>
  );
}
