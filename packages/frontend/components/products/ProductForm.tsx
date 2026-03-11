'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DOMAINS = [
  'Clinical', 'Finance', 'Operations', 'HR', 'Supply Chain',
  'Public Safety', 'Infrastructure', 'Analytics', 'Other',
];

interface Props {
  initial?: any;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState({
    name: '',
    domain: '',
    description: '',
    version: '1.0.0',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name ?? '',
        domain: initial.domain ?? '',
        description: initial.description ?? '',
        version: initial.version ?? '1.0.0',
      });
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Product Name *</Label>
        <Input
          id="name"
          required
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Participant Journey Dataset"
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="domain">Domain</Label>
        <select
          id="domain"
          value={form.domain}
          onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">— Select domain —</option>
          {DOMAINS.map(d => <option key={d} value={d.toLowerCase()}>{d}</option>)}
        </select>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="What data does this product expose and for whom?"
          rows={3}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
        />
      </div>

      <div>
        <Label htmlFor="version">Version</Label>
        <Input
          id="version"
          value={form.version}
          onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
          placeholder="1.0.0"
          className="mt-1"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Product'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
