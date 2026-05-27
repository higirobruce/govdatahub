'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { DashboardFilterDef } from '@/lib/api';

export type FilterValues = Record<string, unknown>;

interface UseDashboardFiltersResult {
  values: FilterValues;
  setValue: (name: string, value: unknown) => void;
  reset: () => void;
}

/**
 * Syncs dashboard filter values with URL search params.
 * - Reads initial values from URL on mount; falls back to filter `default`.
 * - On change, replaces the URL (no history push) so back/forward stays clean.
 * - Encoding rules:
 *     date_range  → `{name}.start` and `{name}.end` params
 *     multi_select → comma-separated values in a single param
 *     all others  → string value
 */
export function useDashboardFilters(
  defs: DashboardFilterDef[],
): UseDashboardFiltersResult {
  const router = useRouter();
  const searchParams = useSearchParams();

  const values = useMemo<FilterValues>(() => {
    const out: FilterValues = {};
    for (const def of defs) {
      const raw = readParam(def, searchParams);
      if (raw !== undefined) {
        out[def.name] = raw;
      } else if (def.default !== undefined) {
        out[def.name] = def.default;
      }
    }
    return out;
  }, [defs, searchParams]);

  const writeParams = useCallback(
    (next: FilterValues) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const def of defs) {
        // Strip any old keys for this filter first.
        params.delete(def.name);
        params.delete(`${def.name}.start`);
        params.delete(`${def.name}.end`);
        writeParam(def, next[def.name], params);
      }
      const qs = params.toString();
      router.replace(`?${qs}`, { scroll: false });
    },
    [defs, router, searchParams],
  );

  const setValue = useCallback(
    (name: string, value: unknown) => {
      writeParams({ ...values, [name]: value });
    },
    [values, writeParams],
  );

  const reset = useCallback(() => {
    const defaults: FilterValues = {};
    for (const def of defs) {
      if (def.default !== undefined) defaults[def.name] = def.default;
    }
    writeParams(defaults);
  }, [defs, writeParams]);

  return { values, setValue, reset };
}

function readParam(
  def: DashboardFilterDef,
  search: URLSearchParams,
): unknown {
  switch (def.type) {
    case 'date_range': {
      const start = search.get(`${def.name}.start`);
      const end = search.get(`${def.name}.end`);
      if (start === null && end === null) return undefined;
      return { start: start ?? '', end: end ?? '' };
    }
    case 'multi_select': {
      const raw = search.get(def.name);
      if (raw === null) return undefined;
      return raw.split(',').filter(Boolean);
    }
    case 'number': {
      const raw = search.get(def.name);
      if (raw === null) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    default: {
      const raw = search.get(def.name);
      return raw ?? undefined;
    }
  }
}

function writeParam(
  def: DashboardFilterDef,
  value: unknown,
  params: URLSearchParams,
): void {
  if (value === undefined || value === null || value === '') return;
  switch (def.type) {
    case 'date_range': {
      const range = value as { start?: string; end?: string };
      if (range.start) params.set(`${def.name}.start`, range.start);
      if (range.end) params.set(`${def.name}.end`, range.end);
      return;
    }
    case 'multi_select': {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length > 0) params.set(def.name, arr.join(','));
      return;
    }
    case 'number':
      params.set(def.name, String(value));
      return;
    default:
      params.set(def.name, String(value));
  }
}

/**
 * Build the parameters payload for a saved-query execute call by resolving
 * the widget's parameterBindings against the dashboard's filter values.
 *
 * Bindings are `{ savedQueryParamName: filterAccessor }` where filterAccessor
 * is either `filterName` (use the whole filter value) or `filterName.start` /
 * `filterName.end` (read a nested field, e.g. date_range).
 */
export function resolveBindings(
  bindings: Record<string, string> | undefined,
  filterValues: FilterValues,
): Record<string, unknown> {
  if (!bindings) return {};
  const out: Record<string, unknown> = {};
  for (const [paramName, accessor] of Object.entries(bindings)) {
    const [head, ...rest] = accessor.split('.');
    let v: unknown = filterValues[head];
    for (const seg of rest) {
      if (v && typeof v === 'object') {
        v = (v as Record<string, unknown>)[seg];
      } else {
        v = undefined;
        break;
      }
    }
    if (v !== undefined) out[paramName] = v;
  }
  return out;
}
