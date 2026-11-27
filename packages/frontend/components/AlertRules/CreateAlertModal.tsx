'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Mail, Hash, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';

interface NotificationChannel {
  type: 'email' | 'slack';
  target: string;
}

interface CreateAlertModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const OPERATORS = [
  { value: 'gt', label: 'gt (>)' },
  { value: 'gte', label: 'gte (≥)' },
  { value: 'lt', label: 'lt (<)' },
  { value: 'lte', label: 'lte (≤)' },
  { value: 'eq', label: 'eq (=)' },
  { value: 'ne', label: 'ne (≠)' },
];

export function CreateAlertModal({ onClose, onCreated }: CreateAlertModalProps) {
  const [connections, setConnections] = useState<any[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [sql, setSql] = useState('');
  const [thresholdValue, setThresholdValue] = useState<number>(0);
  const [thresholdOperator, setThresholdOperator] = useState('gt');
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState(60);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [slackInput, setSlackInput] = useState('');
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    api.connections.list().then((data: any) => {
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setConnections(list);
      if (list.length > 0) setConnectionId(list[0].id);
    }).catch(() => {
      setConnections([]);
    }).finally(() => setLoadingConnections(false));
  }, []);

  const addSlack = () => {
    const url = slackInput.trim();
    if (!url) return;
    setChannels([...channels, { type: 'slack', target: url }]);
    setSlackInput('');
  };

  const addEmail = () => {
    const email = emailInput.trim();
    if (!email) return;
    setChannels([...channels, { type: 'email', target: email }]);
    setEmailInput('');
  };

  const removeChannel = (index: number) => {
    setChannels(channels.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!sql.trim()) { setError('SQL query is required.'); return; }
    if (!connectionId) { setError('Please select a connection.'); return; }

    setSaving(true);
    setError(null);
    try {
      await api.alerts.create({
        name: name.trim(),
        description: description.trim() || null,
        connectionId,
        sql: sql.trim(),
        thresholdValue: Number(thresholdValue),
        thresholdOperator,
        checkIntervalMinutes: Number(checkIntervalMinutes),
        notificationChannels: channels,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create alert rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">New Alert Rule</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. High error rate alert"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Connection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Connection <span className="text-red-500">*</span>
            </label>
            {loadingConnections ? (
              <div className="text-xs text-gray-400 py-1">Loading connections…</div>
            ) : (
              <select
                value={connectionId}
                onChange={e => setConnectionId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {connections.length === 0 && (
                  <option value="">No connections available</option>
                )}
                {connections.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* SQL */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              SQL Query <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-1">Must return a single numeric value.</p>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              placeholder={'SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL \'1 hour\''}
              rows={4}
              spellCheck={false}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono"
            />
          </div>

          {/* Threshold */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Threshold operator
              </label>
              <select
                value={thresholdOperator}
                onChange={e => setThresholdOperator(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {OPERATORS.map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Threshold value
              </label>
              <input
                type="number"
                value={thresholdValue}
                onChange={e => setThresholdValue(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Interval */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Check interval (minutes)
            </label>
            <input
              type="number"
              min={1}
              value={checkIntervalMinutes}
              onChange={e => setCheckIntervalMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Notifications — collapsible */}
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>Notification channels ({channels.length})</span>
              {notificationsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {notificationsOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                {/* Slack */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Slack webhook URL</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={slackInput}
                      onChange={e => setSlackInput(e.target.value)}
                      placeholder="https://hooks.slack.com/services/…"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addSlack}
                      className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email address</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder="ops@example.com"
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addEmail}
                      className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Note: requires SMTP configuration on the server.</p>
                </div>

                {/* Channel list */}
                {channels.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {channels.map((ch, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded px-2 py-1.5 text-xs">
                        {ch.type === 'email' ? (
                          <Mail className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        ) : (
                          <Hash className="w-3 h-3 text-purple-500 flex-shrink-0" />
                        )}
                        <span className="flex-1 truncate text-gray-700">{ch.target}</span>
                        <button
                          type="button"
                          onClick={() => removeChannel(i)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Alert'}
          </button>
        </div>
      </div>
    </div>
  );
}
