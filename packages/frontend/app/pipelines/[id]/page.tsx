'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { Pipeline, PipelineDefinition, PipelineEdge, PipelineRun, PipelineStep, PipelineStepType, StepRunResult } from '@/types/pipeline';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import StepConfigPanel from '@/components/PipelineBuilder/StepConfigPanel';
import RunHistoryPanel from '@/components/PipelineBuilder/RunHistoryPanel';
import {
  Workflow,
  Play,
  Save,
  Upload,
  GitBranch,
  Link,
  Share2,
  Pause,
  ArrowLeft,
  Clock,
  Loader2,
  Settings,
} from 'lucide-react';

// Dynamic import for React Flow (SSR-safe)
const PipelineCanvas = dynamic(
  () => import('@/components/PipelineBuilder/PipelineCanvas'),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#aaaaaa]" /></div> },
);

const STEP_TYPES: { type: PipelineStepType; label: string; icon: React.ReactNode; defaultLabel: string }[] = [
  { type: 'ingest', label: 'Ingest', icon: <Upload className="w-4 h-4" />, defaultLabel: 'Import Data' },
  { type: 'transform', label: 'Transform', icon: <GitBranch className="w-4 h-4" />, defaultLabel: 'Run Transformation' },
  { type: 'cross-query', label: 'Cross-Query', icon: <Link className="w-4 h-4" />, defaultLabel: 'Cross-Query' },
  { type: 'export', label: 'Export', icon: <Share2 className="w-4 h-4" />, defaultLabel: 'Export Dataset' },
];

function ScheduleInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  function commit() {
    onChange(draft.trim() || null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="e.g. 0 2 * * *"
          className="text-xs border border-violet-400 rounded px-2 py-0.5 w-32 focus:outline-none"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value ?? ''); setEditing(true); }}
      className="flex items-center gap-1 text-xs text-[#555555] hover:text-violet-600 transition-colors"
    >
      <Clock className="w-3.5 h-3.5" />
      {value ? <span className="font-mono">{value}</span> : <span className="text-[#aaaaaa]">No schedule</span>}
    </button>
  );
}

export default function PipelineEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const pipelineId = params.id as string;

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable state
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [edges, setEdges] = useState<PipelineEdge[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Run state
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<Record<string, StepRunResult>>({});
  const [isRunning, setIsRunning] = useState(false);

  // UI state
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [stopOnError, setStopOnError] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadPipeline();
    loadRuns();
    return () => stopPolling();
  }, [pipelineId]);

  // Live polling while a run is active
  useEffect(() => {
    if (activeRunId && isRunning) {
      startPolling();
    } else {
      stopPolling();
    }
    return () => stopPolling();
  }, [activeRunId, isRunning]);

  async function loadPipeline() {
    try {
      const data = await api.pipelines.get(pipelineId);
      setPipeline(data);
      setName(data.name);
      setSchedule(data.schedule);
      setStopOnError(data.stopOnError);
      setSteps(data.definition?.steps ?? []);
      setEdges(data.definition?.edges ?? []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load pipeline', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns() {
    try {
      const data = await api.pipelines.getRuns(pipelineId, 10);
      setRuns(data);
      // If the latest run is still running, start polling
      const latestRun = data[0];
      if (latestRun?.status === 'running') {
        setActiveRunId(latestRun.id);
        setRunResults(latestRun.stepResults ?? {});
        setIsRunning(true);
      }
    } catch {
      // Non-critical
    }
  }

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      if (!activeRunId) return;
      try {
        const run = await api.pipelines.getRun(pipelineId, activeRunId);
        setRunResults(run.stepResults ?? {});
        setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
        if (run.status !== 'running') {
          setIsRunning(false);
          setActiveRunId(null);
          stopPolling();
          if (run.status === 'success') {
            showToast('Pipeline completed successfully', 'success');
          } else if (run.status === 'failed') {
            showToast(run.errorMessage || 'Pipeline failed', 'error');
          } else if (run.status === 'partial') {
            showToast('Pipeline completed with errors', 'error');
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function markDirty() {
    setIsDirty(true);
  }

  function handleAddStep(type: PipelineStepType, defaultLabel: string) {
    const newStep: PipelineStep = {
      id: uuidv4(),
      type,
      label: defaultLabel,
      config: {},
      position: { x: 150 + steps.length * 50, y: 100 + steps.length * 120 },
    };
    setSteps((prev) => [...prev, newStep]);
    setSelectedStepId(newStep.id);
    markDirty();
  }

  function handleUpdateStep(updated: PipelineStep) {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    markDirty();
  }

  function handleDeleteStep(stepId: string) {
    setSteps((prev) => prev.filter((s) => s.id !== stepId));
    setEdges((prev) => prev.filter((e) => e.source !== stepId && e.target !== stepId));
    if (selectedStepId === stepId) setSelectedStepId(null);
    markDirty();
  }

  function handleAddEdge(edge: PipelineEdge) {
    setEdges((prev) => {
      const exists = prev.some((e) => e.source === edge.source && e.target === edge.target);
      if (exists) return prev;
      return [...prev, edge];
    });
    markDirty();
  }

  function handleDeleteEdge(edgeId: string) {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    markDirty();
  }

  function handleUpdatePositions(updated: PipelineStep[]) {
    setSteps(updated);
    markDirty();
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const definition: PipelineDefinition = { steps, edges };
      await api.pipelines.update(pipelineId, { name, schedule, stopOnError, definition });
      setIsDirty(false);
      showToast('Pipeline saved', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save pipeline', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  function validateSteps(): string | null {
    for (const step of steps) {
      if (step.type === 'transform' && !step.config.transformationId) {
        return `Step "${step.label}" needs a Transformation selected.`;
      }
      if (step.type === 'cross-query' && !step.config.savedCrossQueryId) {
        return `Step "${step.label}" needs a Saved Cross-Query selected. Open the step config panel and select one.`;
      }
      if (step.type === 'ingest' && !step.config.sourceConnectionId) {
        return `Step "${step.label}" needs a Source Connection selected.`;
      }
      if (step.type === 'ingest' && !step.config.sourceTable) {
        return `Step "${step.label}" needs a Table name entered (e.g. "orders" or "public.orders").`;
      }
    }
    return null;
  }

  async function handleRun() {
    const validationError = validateSteps();
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }
    if (isDirty) {
      await handleSave();
    }
    setIsRunning(true);
    // Reset run results
    const initialResults: Record<string, StepRunResult> = {};
    for (const step of steps) {
      initialResults[step.id] = { status: 'pending' };
    }
    setRunResults(initialResults);

    try {
      const run = await api.pipelines.run(pipelineId);
      setActiveRunId(run.id);
      setRuns((prev) => [run, ...prev]);
    } catch (err: any) {
      setIsRunning(false);
      showToast(err.message || 'Failed to start pipeline', 'error');
    }
  }

  async function handleToggleStatus() {
    if (!pipeline) return;
    const newStatus = pipeline.status === 'active' ? 'paused' : 'active';
    try {
      const updated = await api.pipelines.update(pipelineId, { status: newStatus });
      setPipeline(updated);
      showToast(`Pipeline ${newStatus === 'active' ? 'activated' : 'paused'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update pipeline', 'error');
    }
  }

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#aaaaaa]" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafafa]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#e8e8e8] flex-shrink-0">
        <button
          onClick={() => router.push('/pipelines')}
          className="p-1.5 hover:bg-[#f5f5f5] rounded-md transition-colors text-[#555555]"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <Workflow className="w-4 h-4 text-violet-500 flex-shrink-0" />

        {/* Inline editable name */}
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); markDirty(); }}
          className="font-semibold text-[#1a1a1a] bg-transparent border-b border-transparent hover:border-[#e8e8e8] focus:border-violet-400 focus:outline-none px-1 text-sm min-w-0 flex-shrink"
        />

        {/* Status badge */}
        {pipeline && (
          <button
            onClick={handleToggleStatus}
            className={`text-xs font-medium rounded-full px-2 py-0.5 border transition-colors ${
              pipeline.status === 'active'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                : 'text-[#777777] bg-[#f5f5f5] border-[#e8e8e8] hover:bg-[#eeeeee]'
            }`}
          >
            {pipeline.status === 'active' ? 'Active' : 'Paused'}
          </button>
        )}

        <ScheduleInput
          value={schedule}
          onChange={(v) => { setSchedule(v); markDirty(); }}
        />

        <div className="flex-1" />

        <button
          onClick={() => setShowSettings((v) => !v)}
          className={`p-1.5 rounded-md transition-colors ${showSettings ? 'bg-[#f0f0f0] text-[#1a1a1a]' : 'text-[#555555] hover:bg-[#f5f5f5]'}`}
          title="Pipeline settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        <Button
          variant="outline"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="gap-1.5 text-sm"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </Button>

        <Button
          onClick={handleRun}
          disabled={isRunning || steps.length === 0}
          className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-sm"
        >
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {isRunning ? 'Running…' : 'Run'}
        </Button>
      </div>

      {/* Settings panel (collapsible) */}
      {showSettings && (
        <div className="flex items-center gap-4 px-6 py-3 bg-[#fafafa] border-b border-[#e8e8e8] text-sm flex-shrink-0">
          <label className="flex items-center gap-2 text-[#555555]">
            <input
              type="checkbox"
              checked={stopOnError}
              onChange={(e) => { setStopOnError(e.target.checked); markDirty(); }}
              className="rounded"
            />
            Stop on first error
          </label>
        </div>
      )}

      {/* Main workspace */}
      <div className="flex-1 flex min-h-0">
        {/* Left — Step library */}
        <div className="w-[180px] flex-shrink-0 bg-white border-r border-[#e8e8e8] flex flex-col">
          <div className="px-3 py-2.5 border-b border-[#f0f0f0]">
            <p className="text-[10px] font-bold text-[#999999] uppercase tracking-wide">Add Step</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {STEP_TYPES.map(({ type, label, icon, defaultLabel }) => (
              <button
                key={type}
                onClick={() => handleAddStep(type, defaultLabel)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[#555555] hover:bg-[#f5f5f5] transition-colors text-left"
              >
                <span className="flex-shrink-0">{icon}</span>
                <span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Center + Right + Bottom */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Canvas row */}
          <div className="flex-1 flex min-h-0">
            {/* Canvas */}
            <div className="flex-1 min-w-0 min-h-0">
              <PipelineCanvas
                steps={steps}
                edges={edges}
                runResults={runResults}
                selectedStepId={selectedStepId}
                onSelectStep={setSelectedStepId}
                onUpdatePositions={handleUpdatePositions}
                onAddEdge={handleAddEdge}
                onDeleteEdge={handleDeleteEdge}
                onDeleteStep={handleDeleteStep}
              />
            </div>

            {/* Right — Step config */}
            {selectedStep && (
              <StepConfigPanel
                step={selectedStep}
                onUpdate={handleUpdateStep}
                onDelete={() => handleDeleteStep(selectedStep.id)}
                onClose={() => setSelectedStepId(null)}
              />
            )}
          </div>

          {/* Run history */}
          <RunHistoryPanel
            runs={runs}
            steps={steps}
            activeRunId={activeRunId}
          />
        </div>
      </div>
    </div>
  );
}
