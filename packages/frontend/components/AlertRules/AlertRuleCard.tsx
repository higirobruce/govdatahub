'use client';

import { useState } from 'react';
import { Trash2, Play, ToggleLeft, ToggleRight, Clock, AlertTriangle, CheckCircle, Circle } from 'lucide-react';
import { api } from '@/lib/api';

interface AlertRule {
  id: string;
  name: string;
  description: string | null;
  connectionId: string;
  sql: string;
  thresholdValue: number;
  thresholdOperator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'ne';
  checkIntervalMinutes: number;
  notificationChannels: { type: 'email' | 'slack'; target: string }[];
  enabled: boolean;
  lastTriggeredAt: string | null;
  lastCheckedAt: string | null;
  lastValue: number | null;
  lastStatus: 'ok' | 'triggered' | null;
  createdAt: string;
  updatedAt: string;
}

interface AlertRuleCardProps {
  rule: AlertRule;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onCheckComplete: () => void;
}

const OPERATOR_LABELS: Record<string, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
  ne: '≠',
};

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function AlertRuleCard({ rule, onDelete, onToggle, onCheckComplete }: AlertRuleCardProps) {
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const statusBadge = () => {
    if (!rule.lastStatus) {
      return (
        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
          <Circle className="w-3 h-3" />
          Unchecked
        </span>
      );
    }
    if (rule.lastStatus === 'triggered') {
      return (
        <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
          <AlertTriangle className="w-3 h-3" />
          Triggered
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
        <CheckCircle className="w-3 h-3" />
        OK
      </span>
    );
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await api.alerts.check(rule.id);
      onCheckComplete();
    } catch {
      // silent — parent will refresh anyway
    } finally {
      setChecking(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete alert rule "${rule.name}"?`)) return;
    setDeleting(true);
    try {
      await api.alerts.remove(rule.id);
      onDelete(rule.id);
    } catch {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await api.alerts.update(rule.id, { enabled: !rule.enabled });
      onToggle(rule.id, !rule.enabled);
    } catch {
      // silent
    } finally {
      setToggling(false);
    }
  };

  const sqlPreview = rule.sql.length > 60 ? rule.sql.slice(0, 60) + '…' : rule.sql;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{rule.name}</h3>
            {statusBadge()}
            {!rule.enabled && (
              <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">Disabled</span>
            )}
          </div>
          {rule.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{rule.description}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
        <div>
          <span className="text-gray-400">Last value: </span>
          <span className="font-medium">{rule.lastValue !== null ? rule.lastValue : '—'}</span>
        </div>
        <div>
          <span className="text-gray-400">Threshold: </span>
          <span className="font-medium">
            {OPERATOR_LABELS[rule.thresholdOperator]} {rule.thresholdValue}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Last triggered: </span>
          <span className="font-medium">{relativeTime(rule.lastTriggeredAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-gray-400" />
          <span>Every {rule.checkIntervalMinutes}m</span>
        </div>
      </div>

      {/* SQL preview */}
      <div className="bg-gray-50 border border-gray-100 rounded px-2 py-1.5">
        <code className="text-xs text-gray-600 font-mono break-all">{sqlPreview}</code>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={rule.enabled ? 'Disable' : 'Enable'}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {rule.enabled
            ? <ToggleRight className="w-4 h-4 text-blue-500" />
            : <ToggleLeft className="w-4 h-4" />}
          {rule.enabled ? 'Enabled' : 'Disabled'}
        </button>

        <button
          onClick={handleCheck}
          disabled={checking}
          title="Run check now"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <Play className="w-3 h-3" />
          {checking ? 'Checking…' : 'Check now'}
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete rule"
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
