'use client';

import { useState } from 'react';
import { Connection } from '@/types';

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
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No connections
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Get started by creating a new database connection.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      <ul className="divide-y divide-gray-200">
        {connections.map((connection) => (
          <li key={connection.id} className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3">
                  <div
                    className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                      connection.type === 'postgresql'
                        ? 'bg-blue-400'
                        : 'bg-orange-400'
                    }`}
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {connection.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {connection.type.toUpperCase()} - {connection.host}:
                      {connection.port}/{connection.database}
                      {connection.ssl && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          SSL
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Created: {new Date(connection.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTest(connection.id)}
                  disabled={testingId === connection.id}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {testingId === connection.id ? 'Testing...' : 'Test'}
                </button>
                <button
                  onClick={() => handleDelete(connection.id)}
                  disabled={deletingId === connection.id}
                  className="inline-flex items-center px-3 py-1.5 border border-red-300 shadow-sm text-xs font-medium rounded text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {deletingId === connection.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
