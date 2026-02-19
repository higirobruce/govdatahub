'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface StagingTable {
  name: string;
  schema: string;
  rowCount: number | null;
  sizeBytes: number;
}

interface StagingColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
}

export default function StagingDataCatalog() {
  const router = useRouter();
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const { data: tables, error: tablesError } = useSWR<StagingTable[]>(
    '/schema/staging/tables',
    async () => {
      const result = await api.schema.getStagingTables();
      return result as StagingTable[];
    }
  );

  const { data: columns } = useSWR<StagingColumn[]>(
    selectedTable ? `/schema/staging/tables/${selectedTable}/columns` : null,
    selectedTable
      ? async () => {
          const result = await api.schema.getStagingColumns(selectedTable);
          return result as StagingColumn[];
        }
      : null
  );

  const handleQueryTable = (table: StagingTable) => {
    const fullTableName = `${table.schema}."${table.name}"`;
    router.push(`/query?staging=true&table=${encodeURIComponent(fullTableName)}`);
  };

  const toggleTable = (tableName: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
      if (selectedTable === tableName) {
        setSelectedTable('');
      }
    } else {
      newExpanded.add(tableName);
      setSelectedTable(tableName);
    }
    setExpandedTables(newExpanded);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
  };

  if (tablesError) {
    return (
      <div className="text-center text-red-600 py-8">
        <p>Failed to load staging tables</p>
        <p className="text-sm text-gray-500 mt-2">{tablesError.message}</p>
      </div>
    );
  }

  if (!tables) {
    return (
      <div className="text-center text-gray-500 py-8">
        <p>Loading staging tables...</p>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
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
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No staging data found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Upload files to staging to see them here
        </p>
        <div className="mt-4">
          <a
            href="/ingestion"
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Upload Data
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          Staging Tables ({tables.length})
        </h3>
        <a
          href="/staged"
          className="text-sm text-indigo-600 hover:text-indigo-500"
        >
          View All Staged Data →
        </a>
      </div>

      <div className="space-y-2">
        {tables.map((table) => (
          <div key={table.name} className="border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div
              className="bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => toggleTable(table.name)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg
                    className={`h-5 w-5 text-gray-400 transition-transform ${
                      expandedTables.has(table.name) ? 'transform rotate-90' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="font-mono text-sm font-medium text-gray-900">
                    {table.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatBytes(table.sizeBytes)}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQueryTable(table);
                  }}
                  className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
                >
                  Query
                </button>
              </div>
            </div>

            {/* Table Details */}
            {expandedTables.has(table.name) && (
              <div className="bg-white px-4 py-3 border-t">
                {selectedTable === table.name && columns ? (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Columns ({columns.length})
                    </h4>
                    <div className="space-y-1">
                      {columns.map((col) => (
                        <div
                          key={col.name}
                          className="flex items-center justify-between py-1 text-sm"
                        >
                          <span className="font-mono text-xs text-gray-900">
                            {col.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {col.type}
                            {col.nullable && (
                              <span className="ml-1 text-gray-400">nullable</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 text-sm py-2">
                    Loading columns...
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
