'use client';

interface KpiCardProps {
  value: number | string;
  label?: string;
  previousValue?: number;
  unit?: string;
  height?: string;
}

export function KpiCard({ value, label, previousValue, unit, height }: KpiCardProps) {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;

  let trend: number | null = null;
  if (previousValue !== undefined && previousValue !== 0 && typeof numericValue === 'number' && !isNaN(numericValue)) {
    trend = ((numericValue - previousValue) / Math.abs(previousValue)) * 100;
  }

  const renderTrend = () => {
    if (trend === null) return null;

    if (trend > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#f0fdf4] text-[#16a34a]">
          ↑ {Math.abs(trend).toFixed(1)}%
        </span>
      );
    } else if (trend < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#fef2f2] text-[#dc2626]">
          ↓ {Math.abs(trend).toFixed(1)}%
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#f5f5f5] text-[#555555]">
          — 0.0%
        </span>
      );
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-4">
      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-bold text-[#1a1a1a] leading-none">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && (
          <span className="text-2xl text-[#555555] ml-1">{unit}</span>
        )}
      </div>
      {renderTrend()}
      {label && (
        <span className="text-sm text-[#555555] text-center">{label}</span>
      )}
    </div>
  );
}
