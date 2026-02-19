'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';

interface StagingTable {
  name: string;
  schema: string;
  rowCount: number | null;
  sizeBytes: number;
}

interface StagingTableBrowserProps {
  onInsertTable: (tableName: string, schemaName: string) => void;
}

export default function StagingTableBrowser({ onInsertTable }: StagingTableBrowserProps) {
  const { data: tables, error } = useSWR<StagingTable[]>(
    '/schema/staging/tables',
    async () => {
      const result = await api.schema.getStagingTables();
      return result as StagingTable[];
    }
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
  };

  if (error) {
    return (
      <div className="text-sm text-red-600">
        Failed to load staging tables: {error.message}
      </div>
    );
  }

  if (!tables) {
    return (
      <div className="text-sm text-gray-500">
        Loading staging tables...
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="text-sm text-gray-500 space-y-2">
        <p>No staging tables available.</p>
        <a href="/ingestion" className="text-indigo-600 hover:text-indigo-500">
          Upload data to staging →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Available Staging Tables (click to insert)
      </label>
      <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
        {tables.map((table) => (
          <button
            key={table.name}
            onClick={() => onInsertTable(table.name, table.schema)}
            className="text-left px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-gray-900">{table.name}</span>
              <span className="text-xs text-gray-500">{formatBytes(table.sizeBytes)}</span>
            </div>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {tables.length} table{tables.length !== 1 ? 's' : ''} available
      </p>
    </div>
  );
}
