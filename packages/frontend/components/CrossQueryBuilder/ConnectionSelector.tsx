'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Connection } from '@/types';

interface ConnectionSelectorProps {
  selectedConnections: string[];
  onSelectionChange: (connectionIds: string[]) => void;
}

export function ConnectionSelector({
  selectedConnections,
  onSelectionChange,
}: ConnectionSelectorProps) {
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

  const handleSelectAll = () => {
    if (connections) {
      onSelectionChange(connections.map((c) => c.id));
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
          className="text-indigo-600 hover:text-indigo-500 mt-2 inline-block"
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

      {/* Connection List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {connections.map((connection) => (
          <label
            key={connection.id}
            className="flex items-start gap-2 p-2 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedConnections.includes(connection.id)}
              onChange={() => handleToggleConnection(connection.id)}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900 truncate">
                {connection.name}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {connection.type} - {connection.database}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {connection.host}:{connection.port}
              </div>
            </div>
          </label>
        ))}
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
