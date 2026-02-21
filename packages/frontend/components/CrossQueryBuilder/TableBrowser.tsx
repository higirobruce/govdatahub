'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Connection, TableInfo, ColumnInfo, QueryDefinition } from '@/types';

interface TableBrowserProps {
  connectionIds: string[];
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

interface StagingTable {
  name: string;
  schema: string;
  rowCount: number | null;
  sizeBytes: number;
}

export function TableBrowser({
  connectionIds,
  queryDefinition,
  onQueryChange,
}: TableBrowserProps) {
  const [expandedConnection, setExpandedConnection] = useState<string | null>(null);

  // Fetch connections
  const { data: allConnections } = useSWR<Connection[]>(
    '/connections',
    async () => {
      const result = await api.connections.list();
      return result as Connection[];
    }
  );

  const connections = allConnections?.filter((c) =>
    connectionIds.includes(c.id)
  );

  const isStagingEnabled = connectionIds.includes('staging');

  // Fetch staging tables if staging is enabled
  const { data: stagingTables } = useSWR<StagingTable[]>(
    isStagingEnabled && expandedConnection === 'staging' ? '/schema/staging/tables' : null,
    async () => {
      const result = await api.schema.getStagingTables();
      return result as StagingTable[];
    }
  );

  // Fetch tables for expanded connection
  const { data: tables, error: tablesError } = useSWR<TableInfo[]>(
    expandedConnection && expandedConnection !== 'staging' ? `/connections/${expandedConnection}/tables` : null,
    expandedConnection && expandedConnection !== 'staging'
      ? async () => {
          const result = await api.schema.getTables(expandedConnection);
          return result as TableInfo[];
        }
      : null
  );

  const handleAddTable = (connection: Connection, table: TableInfo) => {
    // Generate a unique alias
    const baseAlias = table.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let alias = baseAlias;
    let counter = 1;

    while (queryDefinition.tables.some((t) => t.alias === alias)) {
      alias = `${baseAlias}_${counter}`;
      counter++;
    }

    const newTable = {
      connectionId: connection.id,
      schemaName: table.schema,
      tableName: table.name,
      alias,
    };

    onQueryChange({
      ...queryDefinition,
      tables: [...queryDefinition.tables, newTable],
    });
  };

  const handleAddStagingTable = (table: StagingTable) => {
    // Generate a unique alias
    const baseAlias = table.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let alias = baseAlias;
    let counter = 1;

    while (queryDefinition.tables.some((t) => t.alias === alias)) {
      alias = `${baseAlias}_${counter}`;
      counter++;
    }

    const newTable = {
      connectionId: 'staging',
      schemaName: table.schema,
      tableName: table.name,
      alias,
    };

    onQueryChange({
      ...queryDefinition,
      tables: [...queryDefinition.tables, newTable],
    });
  };

  const isTableAdded = (connectionId: string, tableName: string) => {
    return queryDefinition.tables.some(
      (t) => t.connectionId === connectionId && t.tableName === tableName
    );
  };

  if (!connections || connections.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        No connections selected. Select connections above to browse tables.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Regular Connections */}
      {connections.map((connection) => (
        <div key={connection.id} className="border border-gray-200 rounded-md overflow-hidden">
          {/* Connection Header */}
          <button
            onClick={() =>
              setExpandedConnection(expandedConnection === connection.id ? null : connection.id)
            }
            className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left flex items-center justify-between transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {connection.name}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {connection.type}
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${
                expandedConnection === connection.id ? 'transform rotate-90' : ''
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
          </button>

          {/* Tables List */}
          {expandedConnection === connection.id && (
            <div className="bg-white">
              {tablesError && (
                <div className="px-3 py-2 text-xs text-red-600">
                  Failed to load tables
                </div>
              )}
              {!tables && !tablesError && (
                <div className="px-3 py-2 text-xs text-gray-500">
                  Loading tables...
                </div>
              )}
              {tables && tables.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-500">
                  No tables found
                </div>
              )}
              {tables && tables.length > 0 && (
                <div className="max-h-60 overflow-y-auto">
                  {tables.map((table) => (
                    <div
                      key={`${table.schema}.${table.name}`}
                      className="px-3 py-2 hover:bg-gray-50 flex items-center justify-between border-t border-gray-100"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono text-gray-900 truncate">
                          {table.schema}.{table.name}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddTable(connection, table)}
                        disabled={isTableAdded(connection.id, table.name)}
                        className={`text-xs px-2 py-1 rounded ${
                          isTableAdded(connection.id, table.name)
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
                        }`}
                      >
                        {isTableAdded(connection.id, table.name) ? 'Added' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Staging Data */}
      {isStagingEnabled && (
        <div className="border border-[#e8e8e8] rounded-md overflow-hidden">
          {/* Staging Header */}
          <button
            onClick={() =>
              setExpandedConnection(expandedConnection === 'staging' ? null : 'staging')
            }
            className="w-full px-3 py-2 bg-[#f8f8f8] hover:bg-[#f0f0f0] text-left flex items-center justify-between transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#1a1a1a] truncate">
                Staging Data
              </div>
              <div className="text-xs text-[#555555] truncate">
                Uploaded staging tables
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-[#1a1a1a] transition-transform ${
                expandedConnection === 'staging' ? 'transform rotate-90' : ''
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
          </button>

          {/* Staging Tables List */}
          {expandedConnection === 'staging' && (
            <div className="bg-white">
              {!stagingTables && (
                <div className="px-3 py-2 text-xs text-gray-500">
                  Loading staging tables...
                </div>
              )}
              {stagingTables && stagingTables.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-500">
                  No staging tables found. <a href="/ingestion" className="text-[#1a1a1a] hover:text-[#2a2a2a]">Upload data →</a>
                </div>
              )}
              {stagingTables && stagingTables.length > 0 && (
                <div className="max-h-60 overflow-y-auto">
                  {stagingTables.map((table) => (
                    <div
                      key={`${table.schema}.${table.name}`}
                      className="px-3 py-2 hover:bg-gray-50 flex items-center justify-between border-t border-gray-100"
                      title={`Full table name: ${table.schema}.${table.name}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">
                          {table.name}
                        </div>
                        <div className="text-xs text-gray-500 font-mono truncate">
                          {table.schema}.{table.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {table.rowCount ? `${table.rowCount.toLocaleString()} rows` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddStagingTable(table)}
                        disabled={isTableAdded('staging', table.name)}
                        className={`text-xs px-2 py-1 rounded ${
                          isTableAdded('staging', table.name)
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-[#1a1a1a] text-white hover:bg-[#2a2a2a]'
                        }`}
                      >
                        {isTableAdded('staging', table.name) ? 'Added' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
