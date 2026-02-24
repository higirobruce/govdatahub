'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Upload, GitBranch, Link, Share2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { PipelineStepType, StepRunResult } from '@/types/pipeline';

export interface StepNodeData {
  label: string;
  type: PipelineStepType;
  runResult?: StepRunResult;
  selected?: boolean;
}

const STEP_STYLES: Record<PipelineStepType, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
  ingest: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Upload className="w-4 h-4 text-blue-500" />,
    label: 'Ingest',
  },
  transform: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    icon: <GitBranch className="w-4 h-4 text-violet-500" />,
    label: 'Transform',
  },
  'cross-query': {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: <Link className="w-4 h-4 text-orange-500" />,
    label: 'Cross-Query',
  },
  export: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <Share2 className="w-4 h-4 text-emerald-500" />,
    label: 'Export',
  },
};

function StatusRing({ result }: { result?: StepRunResult }) {
  if (!result || result.status === 'pending') return null;

  if (result.status === 'running') {
    return (
      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-white rounded-full shadow-sm">
        <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
      </span>
    );
  }
  if (result.status === 'success') {
    return (
      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-white rounded-full shadow-sm">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
      </span>
    );
  }
  if (result.status === 'failed') {
    return (
      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-white rounded-full shadow-sm">
        <XCircle className="w-3.5 h-3.5 text-red-500" />
      </span>
    );
  }
  if (result.status === 'skipped') {
    return (
      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center bg-white rounded-full shadow-sm text-[#aaaaaa] text-[10px] font-bold">
        —
      </span>
    );
  }
  return null;
}

export const StepNode = memo(function StepNode({ data, selected }: NodeProps<StepNodeData>) {
  const style = STEP_STYLES[data.type] ?? STEP_STYLES.transform;
  const hasError = data.runResult?.status === 'failed';

  return (
    <div
      className={`
        relative min-w-[160px] rounded-xl border-2 shadow-sm transition-all
        ${style.bg} ${selected ? 'border-violet-500 ring-2 ring-violet-200' : hasError ? 'border-red-400' : style.border}
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-[#aaaaaa] !bg-white"
      />

      <div className="px-3 py-2.5 flex items-center gap-2">
        <span className="flex-shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-[#999999] uppercase tracking-wide">
            {style.label}
          </p>
          <p className="text-sm font-medium text-[#1a1a1a] truncate">{data.label}</p>
        </div>
      </div>

      {data.runResult?.error && (
        <div className="px-3 pb-2 text-[10px] text-red-600 truncate" title={data.runResult.error}>
          {data.runResult.error}
        </div>
      )}

      {data.runResult?.rowsProcessed !== undefined && data.runResult.status === 'success' && (
        <div className="px-3 pb-2 text-[10px] text-[#777777]">
          {data.runResult.rowsProcessed.toLocaleString()} rows
        </div>
      )}

      <StatusRing result={data.runResult} />

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !border-2 !border-[#aaaaaa] !bg-white"
      />
    </div>
  );
});
