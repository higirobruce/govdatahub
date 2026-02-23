'use client';

import { CellRuntimeState } from '@/types/notebook';
import ResultsTable from '@/components/QueryInterface/ResultsTable';
import { Loader2, AlertCircle } from 'lucide-react';

interface CellResultsProps {
  runtime: CellRuntimeState;
}

export function CellResults({ runtime }: CellResultsProps) {
  if (runtime.status === 'idle') return null;

  if (runtime.status === 'running') {
    return (
      <div className="mt-2 flex items-center gap-2 px-4 py-3 bg-[#fafafa] border border-[#e8e8e8] rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin text-[#777777]" />
        <span className="text-sm text-[#777777]">Executing…</span>
      </div>
    );
  }

  if (runtime.status === 'error') {
    return (
      <div className="mt-2 flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700 font-mono">{runtime.error}</p>
      </div>
    );
  }

  if (runtime.status === 'success' && runtime.result) {
    const { rowCount, executionTimeMs } = runtime.result;
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2 px-1 mb-2">
          <span className="text-xs text-[#777777]">
            {rowCount} {rowCount === 1 ? 'row' : 'rows'} · {executionTimeMs}ms
          </span>
        </div>
        <div className="min-w-0">
          <ResultsTable result={runtime.result} />
        </div>
      </div>
    );
  }

  return null;
}
