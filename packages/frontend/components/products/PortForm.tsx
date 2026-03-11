'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PORT_TYPES = [
  { value: 'outputport',       label: 'Output Port',       desc: 'Exposes data to consumers' },
  { value: 'inputport',        label: 'Input Port',        desc: 'Receives data from upstream' },
  { value: 'controlport',      label: 'Control Port',      desc: 'Lifecycle management API' },
  { value: 'observabilityport',label: 'Observability Port',desc: 'Metrics, logs, quality' },
];

const TECHNOLOGIES = ['sql', 'rest', 'files', 'stream'];

interface Props {
  initial?: any;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function PortForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: '',
    portType: 'outputport',
    technology: 'sql',
    connectionId: '',
    transformationId: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  const { data: connections } = useSWR('connections', () => api.connections.list());

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name ?? '',
        portType: initial.portType ?? 'outputport',
        technology: initial.technology ?? 'sql',
        connectionId: initial.connectionId ?? '',
        transformationId: initial.transformationId ?? '',
        description: initial.description ?? '',
      });
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...form,
        connectionId: form.connectionId || undefined,
        transformationId: form.transformationId || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="portName">Port Name *</Label>
        <Input
          id="portName"
          required
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Weekly Summary SQL"
          className="mt-1"
        />
      </div>

      <div>
        <Label>Port Type</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PORT_TYPES.map(pt => (
            <button
              key={pt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, portType: pt.value }))}
              className={`text-left p-2 rounded-lg border-2 text-sm transition-colors ${
                form.portType === pt.value
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="font-medium">{pt.label}</div>
              <div className="text-xs text-gray-500">{pt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="technology">Technology</Label>
        <select
          id="technology"
          value={form.technology}
          onChange={e => setForm(f => ({ ...f, technology: e.target.value }))}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {TECHNOLOGIES.map(t => (
            <option key={t} value={t}>{t.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {form.technology === 'sql' && (
        <div>
          <Label htmlFor="connectionId">Source Connection</Label>
          <select
            id="connectionId"
            value={form.connectionId}
            onChange={e => setForm(f => ({ ...f, connectionId: e.target.value }))}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— Optional: link a connection —</option>
            {connections?.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label htmlFor="portDesc">Description</Label>
        <textarea
          id="portDesc"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
          placeholder="What does this port expose?"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Update Port' : 'Add Port'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
