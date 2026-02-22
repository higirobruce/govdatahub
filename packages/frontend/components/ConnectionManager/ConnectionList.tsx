'use client';

import { useState } from 'react';
import { Connection, ConnectionType } from '@/types';
import { Button } from '@/components/ui/button';
import { Database } from 'lucide-react';

const TYPE_COLORS: Record<ConnectionType, string> = {
  postgresql: 'bg-[#60a5fa]',
  mysql: 'bg-[#fb923c]',
  redshift: 'bg-[#c084fc]',
  snowflake: 'bg-[#38bdf8]',
  bigquery: 'bg-[#4ade80]',
  mongodb: 'bg-[#86efac]',
  sqlserver: 'bg-[#f472b6]',
  clickhouse: 'bg-[#fbbf24]',
  sqlite: 'bg-[#94a3b8]',
};

function connectionSubtitle(connection: Connection): string {
  const type = connection.type.toUpperCase();
  if (connection.type === 'bigquery') {
    return `${type} - ${connection.database}`;
  }
  if (connection.type === 'snowflake') {
    const warehouse = connection.warehouse ? ` / ${connection.warehouse}` : '';
    return `${type} - ${connection.host}/${connection.database}${warehouse}`;
  }
  return `${type} - ${connection.host}:${connection.port}/${connection.database}`;
}

interface ConnectionListProps {
  connections: Connection[];
  onDelete: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<void>;
}

export default function ConnectionList({
  connections,
  onDelete,
  onTest,
}: ConnectionListProps) {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await onTest(id);
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (connections.length === 0) {
    return (
      <div className="text-center py-12">
        <Database className="mx-auto h-12 w-12 text-[#aaaaaa]" />
        <h3 className="mt-2 text-sm font-medium text-[#1a1a1a]">
          No connections
        </h3>
        <p className="mt-1 text-sm text-[#aaaaaa]">
          Get started by creating a new database connection.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <ul className="divide-y divide-[#f0f0f0]">
        {connections.map((connection) => (
          <li key={connection.id} className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3">
                  <div
                    className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${TYPE_COLORS[connection.type] || 'bg-[#aaaaaa]'}`}
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-[#1a1a1a] truncate">
                      {connection.name}
                    </h3>
                    <p className="text-sm text-[#555555]">
                      {connectionSubtitle(connection)}
                      {connection.ssl && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#d1fae5] text-[#065f46]">
                          SSL
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[#aaaaaa] mt-1">
                      Created: {new Date(connection.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleTest(connection.id)}
                  disabled={testingId === connection.id}
                  variant="outline"
                  size="sm"
                >
                  {testingId === connection.id ? 'Testing...' : 'Test'}
                </Button>
                <Button
                  onClick={() => handleDelete(connection.id)}
                  disabled={deletingId === connection.id}
                  variant="outline"
                  size="sm"
                  className="text-[#ef4444] border-[#fca5a5] hover:bg-[#fee2e2]"
                >
                  {deletingId === connection.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
