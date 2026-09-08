'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Connection } from '@/types';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { QualityCheckForm } from '@/components/quality/QualityCheckForm';
import { CheckRunHistory } from '@/components/quality/CheckRunHistory';
import {
  ShieldCheck,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Clock,
  Pencil,
  Trash2,
} from 'lucide-react';

const CHECK_TYPE_LABELS: Record<string, string> = {
  not_null: 'Not Null',
  unique: 'Uniqueness',
  min_rows: 'Min Rows',
  max_rows: 'Max Rows',
  freshness: 'Freshness',
  custom_sql: 'Custom SQL',
};

const CHECK_TYPE_COLORS: Record<string, string> = {
  not_null: 'bg-blue-50 text-blue-700',
  unique: 'bg-purple-50 text-purple-700',
  min_rows: 'bg-green-50 text-green-700',
  max_rows: 'bg-green-50 text-green-700',
  freshness: 'bg-amber-50 text-amber-700',
  custom_sql: 'bg-gray-50 text-gray-700',
};

function RunStatusBadge({ status }: { status?: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#aaaaaa]">
        <Clock className="h-3 w-3" /> Never run
      </span>
    );
  }
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Pass
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
        <XCircle className="h-3.5 w-3.5" /> Fail
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5" /> Error
    </span>
  );
}

type RightPanel =
  | { type: 'create' }
  | { type: 'detail'; check: any }
  | null;

export default function QualityPage() {
  const { showToast } = useToast();
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [connectionFilter, setConnectionFilter] = useState('');

  const { data: connections } = useSWR<Connection[]>('/connections', () =>
    api.connections.list() as Promise<Connection[]>
  );
  const { data: checks, mutate: mutateChecks } = useSWR(
    `/data-quality/checks?connectionId=${connectionFilter}`,
    () => api.dataQuality.listChecks(connectionFilter ? { connectionId: connectionFilter } : undefined),
    { refreshInterval: 30000 },
  );
  const { data: runs, mutate: mutateRuns } = useSWR(
    rightPanel?.type === 'detail' ? `/data-quality/checks/${rightPanel.check.id}/runs` : null,
    () => rightPanel?.type === 'detail' ? api.dataQuality.getCheckRuns(rightPanel.check.id) : Promise.resolve([]),
  );

  const handleRun = async (checkId: string) => {
    setRunningId(checkId);
    try {
      const run = await api.dataQuality.runCheck(checkId);
      await mutateChecks();
      if (rightPanel?.type === 'detail' && rightPanel.check.id === checkId) {
        await mutateRuns();
      }
      showToast(
        run.status === 'pass' ? 'Check passed' : run.status === 'fail' ? 'Check failed' : 'Check error',
        run.status === 'pass' ? 'success' : 'error',
      );
    } catch (err: any) {
      showToast(err.message || 'Run failed', 'error');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (checkId: string) => {
    if (!confirm('Delete this quality check?')) return;
    try {
      await api.dataQuality.deleteCheck(checkId);
      await mutateChecks();
      if (rightPanel?.type === 'detail' && rightPanel.check.id === checkId) {
        setRightPanel(null);
      }
      showToast('Check deleted', 'success');
    } catch (err: any) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const handleSaved = async (check: any) => {
    await mutateChecks();
    setRightPanel({ type: 'detail', check });
    showToast('Quality check saved', 'success');
  };

  // Group checks by schema.table
  const grouped = (checks ?? []).reduce<Record<string, any[]>>((acc, c) => {
    const key = `${c.schemaName}.${c.tableName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  return (
    <div className="w-full">
      <PageHeader
        title="Data Quality"
        subtitle="Define and run quality checks across your data sources"
      />

      <div className="flex gap-4 h-[calc(100vh-160px)]">
        {/* Left panel — check list */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">
          {/* Actions */}
          <div className="flex gap-2">
            <select
              value={connectionFilter}
              onChange={(e) => setConnectionFilter(e.target.value)}
              className="flex-1 rounded-md border border-[#dddddd] px-3 py-2 text-sm focus:border-[#1a1a1a] outline-none"
            >
              <option value="">All connections</option>
              {connections?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => setRightPanel({ type: 'create' })} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>

          {/* Check list */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {!checks ? (
              <div className="flex items-center justify-center py-12 text-[#aaaaaa] text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
              </div>
            ) : checks.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#e8e8e8] p-8 text-center">
                <ShieldCheck className="h-10 w-10 text-[#dddddd] mx-auto mb-3" />
                <p className="text-sm font-medium text-[#1a1a1a] mb-1">No quality checks yet</p>
                <p className="text-xs text-[#aaaaaa] mb-4">Create your first check to start monitoring data quality</p>
                <Button size="sm" onClick={() => setRightPanel({ type: 'create' })} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create check
                </Button>
              </div>
            ) : (
              Object.entries(grouped).map(([tableKey, tableChecks]) => (
                <div key={tableKey} className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#f0f0f0] bg-[#fafafa]">
                    <span className="text-xs font-semibold text-[#555555] font-mono">{tableKey}</span>
                  </div>
                  <div className="divide-y divide-[#f8f8f8]">
                    {tableChecks.map((check) => {
                      const isSelected = rightPanel?.type === 'detail' && rightPanel.check.id === check.id;
                      const isRunning = runningId === check.id;
                      return (
                        <div
                          key={check.id}
                          className={`flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-[#f5f5f5]' : 'hover:bg-[#fafafa]'}`}
                          onClick={() => setRightPanel({ type: 'detail', check })}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CHECK_TYPE_COLORS[check.checkType] ?? 'bg-gray-50 text-gray-700'}`}>
                                {CHECK_TYPE_LABELS[check.checkType] ?? check.checkType}
                              </span>
                              {check.status === 'inactive' && (
                                <span className="text-[10px] text-[#aaaaaa]">inactive</span>
                              )}
                            </div>
                            <div className="text-sm font-medium text-[#1a1a1a] truncate">{check.name}</div>
                            <RunStatusBadge status={check.lastRunStatus} />
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRun(check.id); }}
                            disabled={isRunning}
                            className="shrink-0 p-1 rounded hover:bg-[#f0f0f0] text-[#aaaaaa] hover:text-[#1a1a1a] transition-colors"
                            title="Run check"
                          >
                            {isRunning
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Play className="h-3.5 w-3.5" />}
                          </button>
                          <ChevronRight className="h-3.5 w-3.5 text-[#cccccc] shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto">
          {rightPanel === null && (
            <div className="h-full flex items-center justify-center text-[#aaaaaa]">
              <div className="text-center">
                <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-[#dddddd]" />
                <p className="text-sm">Select a check to view details, or create a new one</p>
              </div>
            </div>
          )}

          {rightPanel?.type === 'create' && (
            <div className="bg-white rounded-xl border border-[#e8e8e8] p-6">
              <h2 className="text-base font-semibold text-[#1a1a1a] mb-4">Create quality check</h2>
              <QualityCheckForm
                onSaved={handleSaved}
                onCancel={() => setRightPanel(null)}
              />
            </div>
          )}

          {rightPanel?.type === 'detail' && (() => {
            const check = rightPanel.check;
            return (
              <div className="space-y-4">
                {/* Check header */}
                <div className="bg-white rounded-xl border border-[#e8e8e8] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${CHECK_TYPE_COLORS[check.checkType] ?? 'bg-gray-50 text-gray-700'}`}>
                          {CHECK_TYPE_LABELS[check.checkType] ?? check.checkType}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded ${check.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-[#f0f0f0] text-[#555555]'}`}>
                          {check.status}
                        </span>
                      </div>
                      <h2 className="text-base font-semibold text-[#1a1a1a]">{check.name}</h2>
                      {check.description && <p className="text-sm text-[#555555] mt-0.5">{check.description}</p>}
                      <div className="mt-2 text-xs text-[#aaaaaa] font-mono">
                        {check.schemaName}.{check.tableName}{check.columnName ? `.${check.columnName}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRightPanel({ type: 'create' })}
                        className="gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRun(check.id)}
                        disabled={runningId === check.id}
                        className="gap-1.5"
                      >
                        {runningId === check.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Play className="h-3.5 w-3.5" />}
                        {runningId === check.id ? 'Running…' : 'Run now'}
                      </Button>
                      <button
                        onClick={() => handleDelete(check.id)}
                        className="p-2 rounded text-[#aaaaaa] hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete check"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Config summary */}
                  <div className="mt-4 pt-4 border-t border-[#f0f0f0]">
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(check.config).map(([k, v]) => (
                        <div key={k} className="bg-[#f5f5f5] rounded px-2.5 py-1 text-xs">
                          <span className="text-[#aaaaaa]">{k}: </span>
                          <span className="text-[#1a1a1a] font-medium">
                            {typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Last run summary */}
                  {check.lastRunAt && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-[#aaaaaa]">
                      <Clock className="h-3.5 w-3.5" />
                      Last run: {new Date(check.lastRunAt).toLocaleString()}
                      {check.lastRunValue != null && (
                        <span className="ml-2 font-mono text-[#555555]">
                          value: {Number(check.lastRunValue).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Run history */}
                <div className="bg-white rounded-xl border border-[#e8e8e8] p-5">
                  <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">Run history (last 50)</h3>
                  <CheckRunHistory runs={runs ?? []} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
