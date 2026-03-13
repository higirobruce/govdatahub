'use client';

import { useState } from 'react';
import { Connection, ConnectionType } from '@/types';
import { Button } from '@/components/ui/button';
import { DbIcon, DB_BG, DB_BORDER, DB_LABELS, HIDDEN_TYPES } from '@/components/ui/db-icons';
import { getCapabilityChips } from '@/lib/connection-capabilities';
import { Database, Trash2, Zap, Lock } from 'lucide-react';

function connectionSubtitle(connection: Connection): string {
  const type = connection.type;
  if (type === 'bigquery') return connection.database;
  if (type === 'sqlite') return connection.database;
  if (type === 'snowflake') {
    const warehouse = connection.warehouse ? ` · ${connection.warehouse}` : '';
    return `${connection.host}/${connection.database}${warehouse}`;
  }
  if (type === 'mongodb') {
    // Could be a full URI or host
    const host = connection.host || '';
    if (host.startsWith('mongodb')) return host.slice(0, 40) + (host.length > 40 ? '…' : '');
    return `${host}:${connection.port}/${connection.database}`;
  }
  return `${connection.host}:${connection.port}/${connection.database}`;
}

interface ConnectionListProps {
  connections: Connection[];
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<void>;
}

export default function ConnectionList({ connections, onDelete, onTest }: ConnectionListProps) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try { await onTest(id); } finally { setTestingId(null); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try { await onDelete(id); } finally { setDeletingId(null); }
  };

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#f5f5f5] flex items-center justify-center mb-4">
          <Database className="h-8 w-8 text-[#cccccc]" />
        </div>
        <p className="text-base font-medium text-[#1a1a1a]">No connections yet</p>
        <p className="mt-1 text-sm text-[#aaaaaa]">Add your first database connection to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {connections.filter((c) => !HIDDEN_TYPES.has(c.type as ConnectionType)).map((connection) => {
        const type = connection.type as ConnectionType;
        const chips = getCapabilityChips(type);
        const bg = DB_BG[type] ?? 'bg-gray-50';
        const border = DB_BORDER[type] ?? 'border-gray-200';
        const label = DB_LABELS[type] ?? type.toUpperCase();
        const isTesting = testingId === connection.id;
        const isDeleting = deletingId === connection.id;

        return (
          <div
            key={connection.id}
            className={`relative flex flex-col rounded-2xl border ${border} ${bg} p-5 gap-4 hover:shadow-md transition-shadow duration-150`}
          >
            {/* Top row: icon + name + actions */}
            <div className="flex items-start gap-3">
              <DbIcon type={type} size={48} className="rounded-xl overflow-hidden shrink-0 shadow-sm" />

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#1a1a1a] text-sm leading-snug truncate">
                  {connection.name}
                </p>
                <p className="text-xs text-[#777777] mt-0.5">{label}</p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleTest(connection.id)}
                  disabled={isTesting || isDeleting}
                  title="Test connection"
                  className="p-1.5 rounded-lg text-[#555555] hover:text-[#1a1a1a] hover:bg-white/70 transition-colors disabled:opacity-40"
                >
                  <Zap className={`h-4 w-4 ${isTesting ? 'animate-pulse text-yellow-500' : ''}`} />
                </button>
                <button
                  onClick={() => handleDelete(connection.id)}
                  disabled={isTesting || isDeleting}
                  title="Delete connection"
                  className="p-1.5 rounded-lg text-[#aaaaaa] hover:text-[#ef4444] hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Subtitle */}
            <div className="text-xs text-[#888888] font-mono bg-white/60 rounded-lg px-3 py-2 truncate border border-white/80">
              {connectionSubtitle(connection)}
            </div>

            {/* Chips row */}
            <div className="flex flex-wrap gap-1.5 items-center">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  title={chip.title}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide ${
                    chip.variant === 'green'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {chip.label}
                </span>
              ))}
              {connection.ssl && (
                <span
                  className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700"
                  title="SSL enabled"
                >
                  <Lock className="h-2.5 w-2.5" />
                  SSL
                </span>
              )}
            </div>

            {/* Created date */}
            <p className="text-[11px] text-[#bbbbbb] -mt-1">
              Added {new Date(connection.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>

            {/* Loading overlay */}
            {isDeleting && (
              <div className="absolute inset-0 rounded-2xl bg-white/70 flex items-center justify-center">
                <span className="text-xs text-[#ef4444] font-medium">Deleting…</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
