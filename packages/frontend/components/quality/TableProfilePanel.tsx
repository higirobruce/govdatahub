'use client';

import { BarChart2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface ColumnProfile {
  name: string;
  dataType: string;
  totalRows: number;
  nullCount: number;
  nullPercent: number;
  distinctCount: number;
  distinctPercent: number;
  min?: string;
  max?: string;
  avg?: number;
  stddev?: number;
}

interface ProfileData {
  status: 'running' | 'success' | 'error';
  rowCount: number | null;
  columnProfiles: ColumnProfile[];
  errorMessage?: string;
  durationMs?: number;
  profiledAt?: string;
}

interface TableProfilePanelProps {
  profile: ProfileData | null;
  isLoading: boolean;
}

function NullBar({ percent }: { percent: number }) {
  const isHigh = percent > 10;
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isHigh ? 'bg-red-400' : 'bg-green-400'}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className={`text-[10px] tabular-nums font-medium w-9 text-right ${isHigh ? 'text-red-600' : 'text-[#555555]'}`}>
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}

export function TableProfilePanel({ profile, isLoading }: TableProfilePanelProps) {
  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-[#aaaaaa] py-2 px-3 bg-[#fafafa] rounded-lg border border-[#f0f0f0]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Profiling table…
      </div>
    );
  }

  if (!profile) return null;

  if (profile.status === 'error') {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-red-600 py-2 px-3 bg-red-50 rounded-lg border border-red-200">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {profile.errorMessage ?? 'Profiling failed'}
      </div>
    );
  }

  if (profile.status === 'running') {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-[#aaaaaa] py-2 px-3 bg-[#fafafa] rounded-lg border border-[#f0f0f0]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Profiling in progress…
      </div>
    );
  }

  const cols = profile.columnProfiles ?? [];

  return (
    <div className="mt-2 rounded-lg border border-[#e8e8e8] overflow-hidden bg-white text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#fafafa] border-b border-[#f0f0f0]">
        <div className="flex items-center gap-1.5 text-[#555555] font-medium">
          <BarChart2 className="h-3.5 w-3.5 text-indigo-500" />
          Column Profile
        </div>
        <div className="flex items-center gap-3 text-[#aaaaaa]">
          {profile.rowCount != null && (
            <span>{Number(profile.rowCount).toLocaleString()} rows</span>
          )}
          {profile.durationMs != null && (
            <span>{profile.durationMs}ms</span>
          )}
        </div>
      </div>

      {cols.length === 0 ? (
        <div className="px-3 py-4 text-center text-[#aaaaaa]">No column data available</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-[#aaaaaa] uppercase tracking-wide border-b border-[#f0f0f0]">
              <th className="px-3 py-1.5 text-left font-medium">Column</th>
              <th className="px-3 py-1.5 text-left font-medium">Type</th>
              <th className="px-3 py-1.5 text-left font-medium">Null %</th>
              <th className="px-3 py-1.5 text-right font-medium">Distinct</th>
              <th className="px-3 py-1.5 text-right font-medium">Min</th>
              <th className="px-3 py-1.5 text-right font-medium">Max</th>
              <th className="px-3 py-1.5 text-right font-medium">Avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f8f8f8]">
            {cols.map((col) => (
              <tr key={col.name} className="hover:bg-[#fafafa]">
                <td className="px-3 py-1.5 font-mono text-[#1a1a1a] truncate max-w-[120px]" title={col.name}>
                  {col.name}
                </td>
                <td className="px-3 py-1.5 text-[#aaaaaa]">{col.dataType}</td>
                <td className="px-3 py-1.5">
                  <NullBar percent={col.nullPercent} />
                </td>
                <td className="px-3 py-1.5 text-right text-[#555555] tabular-nums">
                  {col.distinctCount.toLocaleString()}
                  <span className="text-[#cccccc] ml-1">({col.distinctPercent.toFixed(0)}%)</span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[#555555] max-w-[80px] truncate" title={col.min}>
                  {col.min != null ? col.min.slice(0, 16) : <span className="text-[#cccccc]">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[#555555] max-w-[80px] truncate" title={col.max}>
                  {col.max != null ? col.max.slice(0, 16) : <span className="text-[#cccccc]">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[#555555]">
                  {col.avg != null ? col.avg.toLocaleString() : <span className="text-[#cccccc]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {profile.profiledAt && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-[#f0f0f0] text-[#cccccc]">
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          Profiled {new Date(profile.profiledAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
