'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Connection } from '@/types';
import SchemaTree from '@/components/DataCatalog/SchemaTree';
import StagingDataCatalog from '@/components/DataCatalog/StagingDataCatalog';

type ViewMode = 'connections' | 'staging';

export default function CatalogPage() {
  const router = useRouter();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('connections');

  const { data: connections } = useSWR<Connection[]>('/connections', async () => {
    const result = await api.connections.list();
    return result as Connection[];
  });

  const handleQueryTable = (table: string, schema?: string) => {
    const fullTableName = schema ? `${schema}.${table}` : table;
    router.push(`/query?table=${encodeURIComponent(fullTableName)}&connection=${selectedConnectionId}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Data Catalog</h1>
        <p className="mt-2 text-gray-600">
          Browse schemas, tables, and columns from all data sources
        </p>
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setViewMode('connections')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                viewMode === 'connections'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Database Connections
            </button>
            <button
              onClick={() => setViewMode('staging')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                viewMode === 'staging'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Staging Data
            </button>
          </nav>
        </div>

        <div className="p-4">
          {viewMode === 'connections' ? (
            <>
              {/* Connection Selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Database Connection *
                </label>
                <select
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                >
                  <option value="">-- Select a connection --</option>
                  {connections?.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.type} - {conn.database})
                    </option>
                  ))}
                </select>
                {!connections || connections.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">
                    No connections available.{' '}
                    <a href="/connections" className="text-indigo-600 hover:text-indigo-500">
                      Create one first
                    </a>
                  </p>
                ) : null}
              </div>

              {/* Schema Tree */}
              {selectedConnectionId ? (
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Database Structure
                  </h3>
                  <SchemaTree
                    connectionId={selectedConnectionId}
                    onQueryTable={handleQueryTable}
                  />
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
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
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    Select a connection
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Choose a database connection to explore its structure
                  </p>
                </div>
              )}
            </>
          ) : (
            <StagingDataCatalog />
          )}
        </div>
      </div>
    </div>
  );
}
