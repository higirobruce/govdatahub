'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Connection } from '@/types';
import SchemaTree from '@/components/DataCatalog/SchemaTree';
import StagingDataCatalog from '@/components/DataCatalog/StagingDataCatalog';
import { PageHeader } from '@/components/ui/page-header';
import { FolderOpen } from 'lucide-react';

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
    <div className="w-full">
      <PageHeader
        title="Data Catalog"
        subtitle="Browse schemas, tables, and columns from all data sources"
      />

      {/* View Mode Tabs */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
        <div className="border-b border-[#f0f0f0]">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setViewMode('connections')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'connections'
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
              }`}
            >
              Database Connections
            </button>
            <button
              onClick={() => setViewMode('staging')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'staging'
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
              }`}
            >
              Staging Data
            </button>
          </nav>
        </div>

        <div className="p-6">
          {viewMode === 'connections' ? (
            <>
              {/* Connection Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#555555] mb-2">
                  Select Database Connection *
                </label>
                <select
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
                >
                  <option value="">-- Select a connection --</option>
                  {connections?.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.type} - {conn.database})
                    </option>
                  ))}
                </select>
                {!connections || connections.length === 0 ? (
                  <p className="mt-2 text-sm text-[#aaaaaa]">
                    No connections available.{' '}
                    <a href="/connections" className="text-[#1a1a1a] hover:underline font-medium">
                      Create one first
                    </a>
                  </p>
                ) : null}
              </div>

              {/* Schema Tree */}
              {selectedConnectionId ? (
                <div>
                  <h3 className="text-base font-semibold text-[#1a1a1a] mb-4">
                    Database Structure
                  </h3>
                  <SchemaTree
                    connectionId={selectedConnectionId}
                    onQueryTable={handleQueryTable}
                  />
                </div>
              ) : (
                <div className="text-center text-[#aaaaaa] py-12">
                  <FolderOpen className="mx-auto h-12 w-12 text-[#aaaaaa]" />
                  <h3 className="mt-2 text-sm font-medium text-[#1a1a1a]">
                    Select a connection
                  </h3>
                  <p className="mt-1 text-sm text-[#aaaaaa]">
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
