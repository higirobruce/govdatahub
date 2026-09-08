'use client';

import { useEffect, useRef, useState } from 'react';
import { PipelineStep, PipelineStepType } from '@/types/pipeline';
import { Connection } from '@/types';
import { api } from '@/lib/api';
import { Upload, GitBranch, Link, Share2, Trash2, X } from 'lucide-react';

interface StepConfigPanelProps {
  step: PipelineStep;
  onUpdate: (updated: PipelineStep) => void;
  onDelete: () => void;
  onClose: () => void;
}

const TYPE_META: Record<PipelineStepType, { label: string; color: string; icon: React.ReactNode }> = {
  ingest: { label: 'Ingest', color: 'text-blue-600', icon: <Upload className="w-4 h-4" /> },
  transform: { label: 'Transform', color: 'text-violet-600', icon: <GitBranch className="w-4 h-4" /> },
  'cross-query': { label: 'Cross-Query', color: 'text-orange-600', icon: <Link className="w-4 h-4" /> },
  export: { label: 'Export', color: 'text-emerald-600', icon: <Share2 className="w-4 h-4" /> },
};

function IngestConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    api.connections.list().then((data) => setConnections(data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-[#555555] mb-1">Source Connection</label>
        <select
          value={config.sourceConnectionId ?? ''}
          onChange={(e) => onChange({ ...config, sourceConnectionId: e.target.value })}
          className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 bg-white"
        >
          <option value="">— select connection —</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#555555] mb-1">Schema</label>
        <input
          type="text"
          placeholder="public"
          value={config.sourceSchema ?? ''}
          onChange={(e) => onChange({ ...config, sourceSchema: e.target.value })}
          className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#555555] mb-1">Table</label>
        <input
          type="text"
          placeholder="my_table"
          value={config.sourceTable ?? ''}
          onChange={(e) => onChange({ ...config, sourceTable: e.target.value })}
          className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#555555] mb-1">Target Staging Name</label>
        <input
          type="text"
          placeholder="staged_my_table"
          value={config.targetStagingName ?? ''}
          onChange={(e) => onChange({ ...config, targetStagingName: e.target.value })}
          className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
        />
      </div>
    </div>
  );
}

function TransformConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const [transformations, setTransformations] = useState<any[]>([]);

  useEffect(() => {
    api.transformations.list().then((data) => setTransformations(data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-[#555555] mb-1">Transformation</label>
        <select
          value={config.transformationId ?? ''}
          onChange={(e) => onChange({ ...config, transformationId: e.target.value })}
          className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 bg-white"
        >
          <option value="">— select transformation —</option>
          {transformations.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CrossQueryConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const [savedQueries, setSavedQueries] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.crossQuery.listSaved()
      .then((qs) => { setSavedQueries(qs); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-[#555555] mb-1">Saved Cross-Query</label>
        {loaded && savedQueries.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No saved cross-queries found. Go to{' '}
            <a href="/cross-query" className="underline font-medium" target="_blank" rel="noreferrer">
              Cross-Query
            </a>
            , build and save a query, then come back to select it here.
          </div>
        ) : (
          <select
            value={config.savedCrossQueryId ?? ''}
            onChange={(e) => onChange({ ...config, savedCrossQueryId: e.target.value })}
            className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 bg-white"
          >
            <option value="">— select cross-query —</option>
            {savedQueries.map((q: any) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function ExportConfig({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#777777] bg-amber-50 border border-amber-200 rounded-lg p-3">
        Export steps are not yet supported in pipeline execution. You can configure them for future use.
      </p>
      <div>
        <label className="block text-xs font-semibold text-[#555555] mb-1">Dataset Name</label>
        <input
          type="text"
          placeholder="my_dataset"
          value={config.name ?? ''}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
        />
      </div>
    </div>
  );
}

export default function StepConfigPanel({ step, onUpdate, onDelete, onClose }: StepConfigPanelProps) {
  const [label, setLabel] = useState(step.label);
  const [config, setConfig] = useState(step.config);
  const meta = TYPE_META[step.type];

  // Keep refs so callbacks always see latest values
  const labelRef = useRef(label);
  const configRef = useRef(config);
  labelRef.current = label;
  configRef.current = config;

  // Reset when a different step is selected
  useEffect(() => {
    setLabel(step.label);
    setConfig(step.config);
  }, [step.id]);

  // Called by inner components on every change — immediately propagates to parent
  function handleConfigChange(newConfig: Record<string, any>) {
    setConfig(newConfig);
    configRef.current = newConfig;
    onUpdate({ ...step, label: labelRef.current, config: newConfig });
  }

  // Save the label to parent when the input loses focus
  function handleLabelBlur() {
    onUpdate({ ...step, label: labelRef.current, config: configRef.current });
  }

  return (
    <div className="w-[280px] flex-shrink-0 bg-white border-l border-[#e8e8e8] flex flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8e8]">
        <div className={`flex items-center gap-2 ${meta.color}`}>
          {meta.icon}
          <span className="text-sm font-semibold">{meta.label} Step</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-[#f5f5f5] rounded transition-colors"
        >
          <X className="w-4 h-4 text-[#555555]" />
        </button>
      </div>

      {/* Config body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <label className="block text-xs font-semibold text-[#555555] mb-1">Step Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            className="w-full text-sm border border-[#e8e8e8] rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400"
          />
        </div>

        {/* Type-specific config — all changes propagate to parent immediately */}
        {step.type === 'ingest' && (
          <IngestConfig config={config} onChange={handleConfigChange} />
        )}
        {step.type === 'transform' && (
          <TransformConfig config={config} onChange={handleConfigChange} />
        )}
        {step.type === 'cross-query' && (
          <CrossQueryConfig config={config} onChange={handleConfigChange} />
        )}
        {step.type === 'export' && (
          <ExportConfig config={config} onChange={handleConfigChange} />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[#e8e8e8] flex items-center justify-end gap-2">
        <button
          onClick={onDelete}
          className="p-2 text-[#555555] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete step"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
