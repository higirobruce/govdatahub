'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Connection } from '@/types';

// Connection types that have no PostgreSQL FDW adapter and cannot join cross-queries
const UNSUPPORTED_TYPES = new Set(['mongodb', 'clickhouse', 'bigquery', 'snowflake', 'sqlite']);

interface ConnectionSelectorProps {
  selectedConnections: string[];
  onSelectionChange: (connectionIds: string[]) => void;
  includeStagingToggle?: boolean;
}

export function ConnectionSelector({
  selectedConnections,
  onSelectionChange,
  includeStagingToggle = true,
}: ConnectionSelectorProps) {
  const [stagingEnabled, setStagingEnabled] = useState(false);

  const { data: connections, error } = useSWR<Connection[]>(
    '/connections',
    async () => {
      const result = await api.connections.list();
      return result as Connection[];
    }
  );

  const handleToggleConnection = (connectionId: string) => {
    if (selectedConnections.includes(connectionId)) {
      onSelectionChange(selectedConnections.filter((id) => id !== connectionId));
    } else {
      onSelectionChange([...selectedConnections, connectionId]);
    }
  };

  const handleToggleStaging = () => {
    const newStagingEnabled = !stagingEnabled;
    setStagingEnabled(newStagingEnabled);

    if (newStagingEnabled) {
      // Add 'staging' to selected connections
      if (!selectedConnections.includes('staging')) {
        onSelectionChange([...selectedConnections, 'staging']);
      }
    } else {
      // Remove 'staging' from selected connections
      onSelectionChange(selectedConnections.filter((id) => id !== 'staging'));
    }
  };

  const handleSelectAll = () => {
    if (connections) {
      onSelectionChange(connections.filter((c) => !UNSUPPORTED_TYPES.has(c.type)).map((c) => c.id));
    }
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Failed to load connections: {error.message}
      </div>
    );
  }

  if (!connections) {
    return (
      <div className="text-sm text-gray-500">Loading connections...</div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        <p>No connections available.</p>
        <a
          href="/connections"
          className="text-[#1a1a1a] hover:text-[#2a2a2a] mt-2 inline-block"
        >
          Create a connection →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleSelectAll}
          className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          disabled={selectedConnections.length === connections.length}
        >
          Select All
        </button>
        <button
          onClick={handleClearAll}
          className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
          disabled={selectedConnections.length === 0}
        >
          Clear
        </button>
      </div>

      {/* Staging Data Toggle */}
      {includeStagingToggle && (
        <label className="flex items-start gap-2 p-2 border border-[#e8e8e8] rounded-md bg-[#f8f8f8] hover:bg-[#f0f0f0] cursor-pointer transition-colors">
          <input
            type="checkbox"
            checked={stagingEnabled}
            onChange={handleToggleStaging}
            className="mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-[#1a1a1a]">
              Staging Data
            </div>
            <div className="text-xs text-[#555555]">
              Include uploaded staging tables
            </div>
          </div>
        </label>
      )}

      {/* Connection List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {connections.map((connection) => {
          const unsupported = connection.type === 'mongodb' || connection.type === 'clickhouse' || connection.type === 'bigquery' || connection.type === 'snowflake' || connection.type === 'sqlite';
          return (
            <label
              key={connection.id}
              className={`flex items-start gap-2 p-2 border rounded-md transition-colors ${
                unsupported
                  ? 'border-[#e8e8e8] bg-[#fafafa] opacity-60 cursor-not-allowed'
                  : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
              }`}
              title={unsupported ? `${connection.type} connections cannot be used in cross-queries (no FDW support). Use the Query page instead.` : undefined}
            >
              <input
                type="checkbox"
                checked={selectedConnections.includes(connection.id)}
                onChange={() => !unsupported && handleToggleConnection(connection.id)}
                disabled={unsupported}
                className="mt-0.5 disabled:cursor-not-allowed"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">
                  {connection.name}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {connection.type} - {connection.database}
                  {unsupported && <span className="ml-1 text-[#aaaaaa]">(not supported in cross-queries)</span>}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {connection.host}:{connection.port}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Summary */}
      {selectedConnections.length > 0 && (
        <div className="text-xs text-gray-600 pt-2 border-t">
          {selectedConnections.length} connection{selectedConnections.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}
