'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { AlertRuleCard } from '@/components/AlertRules/AlertRuleCard';
import { CreateAlertModal } from '@/components/AlertRules/CreateAlertModal';

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

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 bg-gray-200 rounded w-1/2" />
            <div className="h-5 bg-gray-100 rounded-full w-16" />
          </div>
          <div className="space-y-2 mb-3">
            <div className="h-3 bg-gray-100 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
          <div className="h-8 bg-gray-50 rounded mb-3" />
          <div className="flex gap-2">
            <div className="h-7 bg-gray-100 rounded w-20" />
            <div className="h-7 bg-gray-100 rounded w-24" />
            <div className="h-7 bg-red-50 rounded w-16 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const data = await api.alerts.list() as any;
      const list: AlertRule[] = Array.isArray(data) ? data : (data?.items ?? []);
      setRules(list);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load alert rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchRules, 30_000);
    return () => clearInterval(interval);
  }, [fetchRules]);

  const handleDelete = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const handleToggle = (id: string, enabled: boolean) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
  };

  return (
    <div className="w-full max-w-full h-full">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Alert Rules</h1>
            <p className="text-sm text-gray-500">Monitor your data and get notified when thresholds are crossed</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Alert
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
          <button onClick={fetchRules} className="ml-3 underline text-red-600 hover:text-red-800">Retry</button>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-7 h-7 text-gray-300" />
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-2">No alert rules yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            Create one to get notified when your data crosses a threshold.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create your first alert
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rules.map(rule => (
            <AlertRuleCard
              key={rule.id}
              rule={rule}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onCheckComplete={fetchRules}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateAlertModal
          onClose={() => setShowCreateModal(false)}
          onCreated={fetchRules}
        />
      )}
    </div>
  );
}
