'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Pipeline } from '@/types/pipeline';
import { Button } from '@/components/ui/button';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

function StatusBadge({ status }: { status: 'active' | 'paused' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#777777] bg-[#f5f5f5] border border-[#e8e8e8] rounded-full px-2 py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[#aaaaaa]" />
      Paused
    </span>
  );
}

function formatRelative(dateStr: string | null) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function PipelinesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadPipelines();
  }, []);

  async function loadPipelines() {
    try {
      const data = await api.pipelines.list();
      setPipelines(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load pipelines', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const pipeline = await api.pipelines.create({ name: 'New Pipeline' });
      router.push(`/pipelines/${pipeline.id}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to create pipeline', 'error');
      setCreating(false);
    }
  }

  async function handleToggleStatus(pipeline: Pipeline) {
    const newStatus = pipeline.status === 'active' ? 'paused' : 'active';
    try {
      const updated = await api.pipelines.update(pipeline.id, { status: newStatus });
      setPipelines((prev) => prev.map((p) => (p.id === pipeline.id ? updated : p)));
      showToast(`Pipeline ${newStatus === 'active' ? 'activated' : 'paused'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update pipeline', 'error');
    }
  }

  async function handleDelete(pipeline: Pipeline) {
    if (!confirm(`Delete "${pipeline.name}"? This cannot be undone.`)) return;
    setDeletingId(pipeline.id);
    try {
      await api.pipelines.delete(pipeline.id);
      setPipelines((prev) => prev.filter((p) => p.id !== pipeline.id));
      showToast('Pipeline deleted', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete pipeline', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRun(pipeline: Pipeline, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.pipelines.run(pipeline.id);
      showToast(`Pipeline "${pipeline.name}" started`, 'success');
      // Refresh to show updated lastRunAt
      loadPipelines();
    } catch (err: any) {
      showToast(err.message || 'Failed to trigger pipeline', 'error');
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafafa]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-[#e8e8e8]">
        <div className="flex items-center gap-2">
          <Workflow className="w-5 h-5 text-violet-500" />
          <h1 className="text-lg font-semibold text-[#1a1a1a]">Pipelines</h1>
          <span className="text-sm text-[#777777]">({pipelines.length})</span>
        </div>
        <Button
          onClick={handleCreate}
          disabled={creating}
          className="gap-2 bg-violet-600 hover:bg-violet-700"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          New Pipeline
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-[#777777]" />
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Workflow className="w-12 h-12 text-[#cccccc]" />
            <p className="text-[#777777] font-medium">No pipelines yet</p>
            <p className="text-sm text-[#999999]">
              Create a pipeline to orchestrate your data workflows.
            </p>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="mt-2 gap-2 bg-violet-600 hover:bg-violet-700"
            >
              <Plus className="w-4 h-4" />
              Create your first pipeline
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pipelines.map((pipeline) => (
              <div
                key={pipeline.id}
                onClick={() => router.push(`/pipelines/${pipeline.id}`)}
                className="bg-white rounded-xl border border-[#e8e8e8] p-5 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all group"
              >
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[#1a1a1a] truncate">{pipeline.name}</h3>
                    {pipeline.description && (
                      <p className="text-xs text-[#777777] mt-0.5 line-clamp-2">
                        {pipeline.description}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={pipeline.status} />
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-[#777777] mb-4">
                  <span className="flex items-center gap-1">
                    <Workflow className="w-3 h-3" />
                    {pipeline.definition?.steps?.length ?? 0} step{(pipeline.definition?.steps?.length ?? 0) !== 1 ? 's' : ''}
                  </span>
                  {pipeline.schedule && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {pipeline.schedule}
                    </span>
                  )}
                  <span className="flex items-center gap-1 ml-auto">
                    <Clock className="w-3 h-3" />
                    {formatRelative(pipeline.lastRunAt)}
                  </span>
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-2 pt-3 border-t border-[#f0f0f0]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => handleRun(pipeline, e)}
                    className="flex items-center gap-1 text-xs text-[#555555] hover:text-violet-600 transition-colors px-2 py-1 rounded hover:bg-[#f5f5f5]"
                    title="Run now"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Run
                  </button>
                  <button
                    onClick={() => handleToggleStatus(pipeline)}
                    className="flex items-center gap-1 text-xs text-[#555555] hover:text-[#1a1a1a] transition-colors px-2 py-1 rounded hover:bg-[#f5f5f5]"
                    title={pipeline.status === 'active' ? 'Pause' : 'Activate'}
                  >
                    {pipeline.status === 'active' ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    {pipeline.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(pipeline)}
                    disabled={deletingId === pipeline.id}
                    className="flex items-center gap-1 text-xs text-[#555555] hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50 ml-auto"
                    title="Delete"
                  >
                    {deletingId === pipeline.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
