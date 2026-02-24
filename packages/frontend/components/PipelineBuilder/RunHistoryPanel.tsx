'use client';

import { PipelineRun, PipelineStep } from '@/types/pipeline';
import { CheckCircle2, XCircle, Clock, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface RunHistoryPanelProps {
  runs: PipelineRun[];
  steps: PipelineStep[];
  activeRunId: string | null;
}

function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RunStatusIcon({ status }: { status: PipelineRun['status'] }) {
  if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0" />;
  if (status === 'success') return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (status === 'partial') return <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return null;
}

function StepResultRow({
  step,
  result,
}: {
  step: PipelineStep;
  result: PipelineRun['stepResults'][string] | undefined;
}) {
  if (!result) return null;
  const statusColor =
    result.status === 'success'
      ? 'text-emerald-600'
      : result.status === 'failed'
      ? 'text-red-600'
      : result.status === 'running'
      ? 'text-blue-600'
      : 'text-[#aaaaaa]';

  return (
    <div className="flex items-start gap-2 py-1 pl-4">
      <span className={`text-xs font-medium ${statusColor} capitalize flex-shrink-0`}>
        {result.status}
      </span>
      <span className="text-xs text-[#555555] truncate flex-1">{step.label}</span>
      {result.rowsProcessed !== undefined && (
        <span className="text-xs text-[#777777] flex-shrink-0">
          {result.rowsProcessed.toLocaleString()} rows
        </span>
      )}
      {result.error && (
        <span className="text-xs text-red-600 truncate flex-1" title={result.error}>
          {result.error}
        </span>
      )}
    </div>
  );
}

function RunRow({
  run,
  steps,
  isActive,
}: {
  run: PipelineRun;
  steps: PipelineStep[];
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(isActive);

  return (
    <div className="border border-[#e8e8e8] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-white hover:bg-[#fafafa] transition-colors text-left"
      >
        <RunStatusIcon status={run.status} />
        <span className="text-xs text-[#555555] flex-1">{formatTime(run.startedAt)}</span>
        <span className="text-xs text-[#777777]">{formatDuration(run.executionTimeMs)}</span>
        <span className="text-[10px] font-medium uppercase text-[#999999]">{run.triggerType}</span>
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-[#aaaaaa]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#aaaaaa]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[#f0f0f0] py-1 bg-[#fafafa]">
          {steps.map((step) => (
            <StepResultRow
              key={step.id}
              step={step}
              result={run.stepResults[step.id]}
            />
          ))}
          {run.errorMessage && (
            <div className="px-4 py-1 text-xs text-red-600">{run.errorMessage}</div>
          )}
          {steps.length === 0 && (
            <div className="px-4 py-1 text-xs text-[#777777]">No steps configured</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RunHistoryPanel({
  runs,
  steps,
  activeRunId,
}: RunHistoryPanelProps) {
  return (
    <div className="border-t border-[#e8e8e8] bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
        <Clock className="w-3.5 h-3.5 text-[#777777]" />
        <span className="text-xs font-semibold text-[#555555] uppercase tracking-wide">
          Run History
        </span>
        <span className="text-xs text-[#999999]">({runs.length})</span>
      </div>

      <div className="overflow-y-auto max-h-52 p-3 space-y-2">
        {runs.length === 0 ? (
          <p className="text-xs text-[#999999] text-center py-4">No runs yet — click Run to execute.</p>
        ) : (
          runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              steps={steps}
              isActive={run.id === activeRunId}
            />
          ))
        )}
      </div>
    </div>
  );
}
