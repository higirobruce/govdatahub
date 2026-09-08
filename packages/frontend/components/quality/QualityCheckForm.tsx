'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Connection } from '@/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

const CHECK_TYPES = [
  { value: 'not_null',    label: 'Not Null',        description: 'Column null rate must be ≤ threshold', needsColumn: true },
  { value: 'unique',      label: 'Uniqueness',       description: 'Column distinct % must be ≥ threshold', needsColumn: true },
  { value: 'min_rows',    label: 'Min Row Count',    description: 'Table must have at least N rows', needsColumn: false },
  { value: 'max_rows',    label: 'Max Row Count',    description: 'Table must have at most N rows', needsColumn: false },
  { value: 'freshness',   label: 'Freshness',        description: 'Most recent row must be within N hours', needsColumn: true },
  { value: 'custom_sql',  label: 'Custom SQL',       description: 'SQL query result compared against threshold', needsColumn: false },
] as const;

interface QualityCheckFormProps {
  existingCheck?: any;
  onSaved: (check: any) => void;
  onCancel: () => void;
}

export function QualityCheckForm({ existingCheck, onSaved, onCancel }: QualityCheckFormProps) {
  const [connectionId, setConnectionId] = useState(existingCheck?.connectionId ?? '');
  const [schemaName, setSchemaName] = useState(existingCheck?.schemaName ?? '');
  const [tableName, setTableName] = useState(existingCheck?.tableName ?? '');
  const [columnName, setColumnName] = useState(existingCheck?.columnName ?? '');
  const [checkType, setCheckType] = useState<string>(existingCheck?.checkType ?? 'not_null');
  const [name, setName] = useState(existingCheck?.name ?? '');
  const [description, setDescription] = useState(existingCheck?.description ?? '');
  const [config, setConfig] = useState<Record<string, any>>(existingCheck?.config ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: connections } = useSWR<Connection[]>('/connections', () =>
    api.connections.list()
  );
  const { data: schemas } = useSWR<any[]>(
    connectionId ? `/schema/${connectionId}/schemas` : null,
    () => api.schema.getSchemas(connectionId),
  );
  const { data: tables } = useSWR<any[]>(
    connectionId && schemaName ? `/schema/${connectionId}/${schemaName}/tables` : null,
    () => api.schema.getTables(connectionId, schemaName),
  );
  const { data: columns } = useSWR<any[]>(
    connectionId && schemaName && tableName ? `/schema/${connectionId}/${schemaName}/${tableName}/columns` : null,
    () => api.schema.getColumns(connectionId, tableName, schemaName),
  );

  const selectedType = CHECK_TYPES.find((t) => t.value === checkType);

  // Auto-generate name when target changes
  useEffect(() => {
    if (!name && tableName && checkType) {
      const typeLabel = CHECK_TYPES.find((t) => t.value === checkType)?.label ?? checkType;
      setName(`${tableName} — ${typeLabel}${columnName ? ` (${columnName})` : ''}`);
    }
  }, [tableName, checkType, columnName]);

  const handleConfigChange = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!connectionId || !schemaName || !tableName || !checkType || !name) {
      setError('Please fill in all required fields.');
      return;
    }
    if (selectedType?.needsColumn && !columnName) {
      setError('Please select a column for this check type.');
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        connectionId,
        schemaName,
        tableName,
        columnName: columnName || undefined,
        name,
        description: description || undefined,
        checkType,
        config,
      };

      const result = existingCheck
        ? await api.dataQuality.updateCheck(existingCheck.id, { name, description, config })
        : await api.dataQuality.createCheck(body);

      onSaved(result);
    } catch (err: any) {
      setError(err.message || 'Failed to save check');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Target selection */}
      {!existingCheck && (
        <>
          <div>
            <label className="block text-xs font-medium text-[#555555] mb-1">Connection *</label>
            <select
              value={connectionId}
              onChange={(e) => { setConnectionId(e.target.value); setSchemaName(''); setTableName(''); setColumnName(''); }}
              className="w-full rounded-md border border-[#dddddd] px-3 py-2 text-sm focus:border-[#1a1a1a] outline-none"
            >
              <option value="">Select connection</option>
              {connections?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#555555] mb-1">Schema *</label>
              <select
                value={schemaName}
                onChange={(e) => { setSchemaName(e.target.value); setTableName(''); setColumnName(''); }}
                disabled={!connectionId}
                className="w-full rounded-md border border-[#dddddd] px-3 py-2 text-sm focus:border-[#1a1a1a] outline-none disabled:opacity-50"
              >
                <option value="">Select schema</option>
                {schemas?.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#555555] mb-1">Table *</label>
              <select
                value={tableName}
                onChange={(e) => { setTableName(e.target.value); setColumnName(''); }}
                disabled={!schemaName}
                className="w-full rounded-md border border-[#dddddd] px-3 py-2 text-sm focus:border-[#1a1a1a] outline-none disabled:opacity-50"
              >
                <option value="">Select table</option>
                {tables?.map((t: any) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {/* Check type */}
      {!existingCheck && (
        <div>
          <label className="block text-xs font-medium text-[#555555] mb-1">Check type *</label>
          <div className="grid grid-cols-2 gap-2">
            {CHECK_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => { setCheckType(t.value); setConfig({}); setColumnName(''); }}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  checkType === t.value
                    ? 'border-[#1a1a1a] bg-[#1a1a1a] text-white'
                    : 'border-[#e8e8e8] text-[#555555] hover:border-[#aaaaaa]'
                }`}
              >
                <div className="font-medium">{t.label}</div>
                <div className={`text-[10px] mt-0.5 ${checkType === t.value ? 'text-gray-300' : 'text-[#aaaaaa]'}`}>
                  {t.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Column selector (for column-level checks) */}
      {!existingCheck && selectedType?.needsColumn && (
        <div>
          <label className="block text-xs font-medium text-[#555555] mb-1">Column *</label>
          <select
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
            disabled={!tableName}
            className="w-full rounded-md border border-[#dddddd] px-3 py-2 text-sm focus:border-[#1a1a1a] outline-none disabled:opacity-50"
          >
            <option value="">Select column</option>
            {columns?.map((c: any) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
          </select>
        </div>
      )}

      {/* Type-specific config */}
      <div className="space-y-3 bg-[#fafafa] rounded-lg p-3 border border-[#f0f0f0]">
        <p className="text-xs font-medium text-[#555555]">Check configuration</p>
        {checkType === 'not_null' && (
          <label className="flex items-center justify-between">
            <span className="text-xs text-[#555555]">Max null %</span>
            <input
              type="number" min="0" max="100" step="0.1"
              value={config.maxNullPercent ?? 5}
              onChange={(e) => handleConfigChange('maxNullPercent', parseFloat(e.target.value))}
              className="w-24 rounded border border-[#dddddd] px-2 py-1 text-sm text-right outline-none focus:border-[#1a1a1a]"
            />
          </label>
        )}
        {checkType === 'unique' && (
          <label className="flex items-center justify-between">
            <span className="text-xs text-[#555555]">Min distinct %</span>
            <input
              type="number" min="0" max="100" step="0.1"
              value={config.minDistinctPercent ?? 99}
              onChange={(e) => handleConfigChange('minDistinctPercent', parseFloat(e.target.value))}
              className="w-24 rounded border border-[#dddddd] px-2 py-1 text-sm text-right outline-none focus:border-[#1a1a1a]"
            />
          </label>
        )}
        {checkType === 'min_rows' && (
          <label className="flex items-center justify-between">
            <span className="text-xs text-[#555555]">Min rows</span>
            <input
              type="number" min="0"
              value={config.minRows ?? 1}
              onChange={(e) => handleConfigChange('minRows', parseInt(e.target.value))}
              className="w-32 rounded border border-[#dddddd] px-2 py-1 text-sm text-right outline-none focus:border-[#1a1a1a]"
            />
          </label>
        )}
        {checkType === 'max_rows' && (
          <label className="flex items-center justify-between">
            <span className="text-xs text-[#555555]">Max rows</span>
            <input
              type="number" min="0"
              value={config.maxRows ?? 1000000}
              onChange={(e) => handleConfigChange('maxRows', parseInt(e.target.value))}
              className="w-32 rounded border border-[#dddddd] px-2 py-1 text-sm text-right outline-none focus:border-[#1a1a1a]"
            />
          </label>
        )}
        {checkType === 'freshness' && (
          <>
            <label className="flex items-center justify-between">
              <span className="text-xs text-[#555555]">Max age (hours)</span>
              <input
                type="number" min="0" step="0.5"
                value={config.maxAgeHours ?? 24}
                onChange={(e) => handleConfigChange('maxAgeHours', parseFloat(e.target.value))}
                className="w-24 rounded border border-[#dddddd] px-2 py-1 text-sm text-right outline-none focus:border-[#1a1a1a]"
              />
            </label>
            {!existingCheck && (
              <label className="flex items-center justify-between">
                <span className="text-xs text-[#555555]">Timestamp column</span>
                <select
                  value={config.timestampColumn ?? columnName}
                  onChange={(e) => handleConfigChange('timestampColumn', e.target.value)}
                  className="w-40 rounded border border-[#dddddd] px-2 py-1 text-sm outline-none focus:border-[#1a1a1a]"
                >
                  <option value="">Same as column</option>
                  {columns?.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </label>
            )}
          </>
        )}
        {checkType === 'custom_sql' && (
          <>
            <div>
              <label className="block text-xs text-[#555555] mb-1">SQL (must return a single numeric value)</label>
              <textarea
                rows={3}
                value={config.sql ?? ''}
                onChange={(e) => handleConfigChange('sql', e.target.value)}
                placeholder="SELECT COUNT(*) FROM public.orders WHERE status = 'failed'"
                className="w-full rounded border border-[#dddddd] px-2 py-1.5 text-xs font-mono outline-none focus:border-[#1a1a1a] resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between">
                <span className="text-xs text-[#555555]">Operator</span>
                <select
                  value={config.operator ?? 'gte'}
                  onChange={(e) => handleConfigChange('operator', e.target.value)}
                  className="rounded border border-[#dddddd] px-2 py-1 text-sm outline-none focus:border-[#1a1a1a]"
                >
                  <option value="gte">≥</option>
                  <option value="gt">&gt;</option>
                  <option value="lte">≤</option>
                  <option value="lt">&lt;</option>
                  <option value="eq">=</option>
                </select>
              </label>
              <label className="flex items-center justify-between">
                <span className="text-xs text-[#555555]">Threshold</span>
                <input
                  type="number"
                  value={config.threshold ?? 0}
                  onChange={(e) => handleConfigChange('threshold', parseFloat(e.target.value))}
                  className="w-24 rounded border border-[#dddddd] px-2 py-1 text-sm text-right outline-none focus:border-[#1a1a1a]"
                />
              </label>
            </div>
          </>
        )}
      </div>

      {/* Name and description */}
      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-[#555555] mb-1">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. orders.email not null"
            className="w-full rounded-md border border-[#dddddd] px-3 py-2 text-sm focus:border-[#1a1a1a] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#555555] mb-1">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-md border border-[#dddddd] px-3 py-2 text-sm focus:border-[#1a1a1a] outline-none"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? 'Saving…' : existingCheck ? 'Save changes' : 'Create check'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
