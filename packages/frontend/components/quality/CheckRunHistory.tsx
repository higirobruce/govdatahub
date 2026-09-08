'use client';

import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react';

interface CheckRun {
  id: string;
  status: 'pass' | 'fail' | 'error';
  actualValue: number | null;
  expectedDesc: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  ranAt: string;
}

interface CheckRunHistoryProps {
  runs: CheckRun[];
}

function StatusBadge({ status }: { status: 'pass' | 'fail' | 'error' }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Pass
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
        <XCircle className="h-3 w-3" /> Fail
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
      <AlertTriangle className="h-3 w-3" /> Error
    </span>
  );
}

export function CheckRunHistory({ runs }: CheckRunHistoryProps) {
  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[#aaaaaa]">
        <Clock className="h-8 w-8 mx-auto mb-2 text-[#dddddd]" />
        No runs yet — click &quot;Run&quot; to execute this check
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#e8e8e8]">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#fafafa] border-b border-[#f0f0f0] text-[#aaaaaa] uppercase tracking-wide text-[10px]">
            <th className="px-4 py-2 text-left font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Value</th>
            <th className="px-4 py-2 text-left font-medium">Expected</th>
            <th className="px-4 py-2 text-right font-medium">Duration</th>
            <th className="px-4 py-2 text-right font-medium">Ran at</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8f8f8]">
          {runs.map((run) => (
            <tr key={run.id} className="hover:bg-[#fafafa]">
              <td className="px-4 py-2">
                <StatusBadge status={run.status} />
              </td>
              <td className="px-4 py-2 tabular-nums text-[#1a1a1a]">
                {run.status === 'error'
                  ? <span className="text-amber-600 font-mono text-[10px]">{run.errorMessage?.slice(0, 60)}</span>
                  : run.actualValue != null
                  ? run.actualValue.toLocaleString(undefined, { maximumFractionDigits: 4 })
                  : <span className="text-[#cccccc]">—</span>}
              </td>
              <td className="px-4 py-2 text-[#555555]">
                {run.expectedDesc ?? <span className="text-[#cccccc]">—</span>}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-[#aaaaaa]">
                {run.durationMs != null ? `${run.durationMs}ms` : '—'}
              </td>
              <td className="px-4 py-2 text-right text-[#aaaaaa]">
                {new Date(run.ranAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
