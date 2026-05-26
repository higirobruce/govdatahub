'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';

interface DashboardFilterBarProps {
  filters: Record<string, string>;
  onFiltersChange: (filters: Record<string, string>) => void;
}

export function DashboardFilterBar({ filters, onFiltersChange }: DashboardFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [dimKey, setDimKey] = useState('');
  const [dimValue, setDimValue] = useState('');

  const activeCount = Object.values(filters).filter((v) => v !== '').length;

  const handleApplyDimension = () => {
    if (!dimKey) return;
    onFiltersChange({ ...filters, [dimKey]: dimValue });
  };

  const handleClearAll = () => {
    onFiltersChange({});
    setDimKey('');
    setDimValue('');
  };

  const activeSummary = Object.entries(filters)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' • ');

  return (
    <div className="mb-4">
      {/* Toggle row */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-2 px-3 py-2 border border-[#e8e8e8] rounded-lg bg-white text-sm text-[#555555] hover:bg-[#f5f5f5] transition-colors"
        >
          <Filter className="w-4 h-4" />
          Filters
          {activeCount > 0 && (
            <span className="bg-[#60a5fa] text-white rounded-full text-xs px-1.5 py-0.5 leading-none">
              {activeCount}
            </span>
          )}
        </button>

        {/* Collapsed active summary */}
        {!expanded && activeSummary && (
          <span className="text-xs text-[#aaaaaa]">Active: {activeSummary}</span>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="bg-white rounded-xl border border-[#e8e8e8] p-4 mt-2">
          {/* Date Range */}
          <div className="mb-4">
            <p className="text-sm font-medium text-[#555555] mb-2">Date Range</p>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#aaaaaa]">From</label>
                <input
                  type="date"
                  value={filters.date_from || ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, date_from: e.target.value })
                  }
                  className="px-3 py-2 border border-[#e8e8e8] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#aaaaaa]">To</label>
                <input
                  type="date"
                  value={filters.date_to || ''}
                  onChange={(e) =>
                    onFiltersChange({ ...filters, date_to: e.target.value })
                  }
                  className="px-3 py-2 border border-[#e8e8e8] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                />
              </div>
            </div>
          </div>

          {/* Dimension Filter */}
          <div className="mb-4">
            <p className="text-sm font-medium text-[#555555] mb-2">Dimension</p>
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#aaaaaa]">Parameter Name</label>
                <input
                  type="text"
                  value={dimKey}
                  onChange={(e) => setDimKey(e.target.value)}
                  placeholder="date_from, region…"
                  className="px-3 py-2 border border-[#e8e8e8] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#aaaaaa]">Value</label>
                <input
                  type="text"
                  value={dimValue}
                  onChange={(e) => setDimValue(e.target.value)}
                  placeholder="value"
                  className="px-3 py-2 border border-[#e8e8e8] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#60a5fa]"
                />
              </div>
              <div className="flex flex-col justify-end">
                <button
                  onClick={handleApplyDimension}
                  className="px-4 py-2 bg-[#60a5fa] text-white text-sm rounded-md hover:bg-[#3b82f6] transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          <hr className="border-[#e8e8e8] my-3" />

          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 text-sm border border-[#e8e8e8] rounded-md text-[#ef4444] hover:bg-[#fee2e2] transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
}
