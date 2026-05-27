'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { DashboardFilterDef } from '@/lib/api';
import type { FilterValues } from './useDashboardFilters';

interface Props {
  filters: DashboardFilterDef[];
  values: FilterValues;
  onChange: (name: string, value: unknown) => void;
  onReset?: () => void;
}

export function DashboardFilterBar({ filters, values, onChange, onReset }: Props) {
  if (filters.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
      <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground self-center mr-2">
        Filters
      </div>
      {filters.map((filter) => (
        <FilterControl
          key={filter.name}
          filter={filter}
          value={values[filter.name]}
          onChange={(v) => onChange(filter.name, v)}
        />
      ))}
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="ml-auto">
          Reset
        </Button>
      )}
    </div>
  );
}

interface ControlProps {
  filter: DashboardFilterDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

function FilterControl({ filter, value, onChange }: ControlProps) {
  const label = filter.label ?? filter.name;

  switch (filter.type) {
    case 'date_range': {
      const range = (value as { start?: string; end?: string }) ?? {};
      return (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono uppercase text-muted-foreground">
            {label}
          </span>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={range.start ?? ''}
              onChange={(e) =>
                onChange({ ...range, start: e.target.value })
              }
              className="h-9 w-[140px]"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              value={range.end ?? ''}
              onChange={(e) =>
                onChange({ ...range, end: e.target.value })
              }
              className="h-9 w-[140px]"
            />
          </div>
        </div>
      );
    }

    case 'date':
      return (
        <FieldShell label={label}>
          <Input
            type="date"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-[150px]"
          />
        </FieldShell>
      );

    case 'number':
      return (
        <FieldShell label={label}>
          <Input
            type="number"
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) =>
              onChange(e.target.value === '' ? undefined : Number(e.target.value))
            }
            className="h-9 w-[120px]"
          />
        </FieldShell>
      );

    case 'text':
      return (
        <FieldShell label={label}>
          <Input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-[180px]"
          />
        </FieldShell>
      );

    case 'select': {
      const options = filter.options ?? [];
      return (
        <FieldShell label={label}>
          <Select
            value={(value as string) ?? ''}
            onValueChange={onChange}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      );
    }

    case 'multi_select': {
      // Inline checkbox-style multi-select to avoid heavy components for v1.
      const selected = new Set((value as string[]) ?? []);
      const options = filter.options ?? [];
      const toggle = (opt: string) => {
        const next = new Set(selected);
        if (next.has(opt)) next.delete(opt);
        else next.add(opt);
        onChange(Array.from(next));
      };
      return (
        <FieldShell label={label}>
          <div className="flex flex-wrap gap-1">
            {options.map((opt) => {
              const active = selected.has(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={
                    'rounded border px-2 py-1 text-xs font-mono transition-colors ' +
                    (active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-muted-foreground hover:text-foreground')
                  }
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    default:
      return null;
  }
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-mono uppercase text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
