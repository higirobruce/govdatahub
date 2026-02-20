'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Connection, QueryResult } from '@/types';
import SQLEditor from '@/components/QueryInterface/SQLEditor';
import ResultsTable from '@/components/QueryInterface/ResultsTable';

type DataSource = 'connections' | 'staging';

interface StagingTable {
  name: string;
  schema: string;
  rowCount: number | null;
  sizeBytes: number;
}

export default function QueryPage() {
  const searchParams = useSearchParams();
  const [dataSource, setDataSource] = useState<DataSource>('connections');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [selectedStagingTable, setSelectedStagingTable] = useState<string>('');
  const [sql, setSql] = useState('SELECT * FROM ');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const { data: connections } = useSWR<Connection[]>('/connections', async () => {
    const result = await api.connections.list();
    return result as Connection[];
  });

  const { data: stagingTables } = useSWR<StagingTable[]>(
    dataSource === 'staging' ? '/schema/staging/tables' : null,
    async () => {
      const result = await api.schema.getStagingTables();
      return result as StagingTable[];
    }
  );

  // Handle URL parameters from catalog
  useEffect(() => {
    const staging = searchParams?.get('staging');
    const table = searchParams?.get('table');
    const schema = searchParams?.get('schema');
    const connection = searchParams?.get('connection');

    if (staging === 'true') {
      setDataSource('staging');
      if (table && schema) {
        setSelectedStagingTable(`${schema}.${table}`);
        setSql(`SELECT * FROM ${schema}."${table}" LIMIT 100;`);
      } else if (table) {
        setSql(`SELECT * FROM ${table} LIMIT 100;`);
      }
    } else if (connection && table) {
      setDataSource('connections');
      setSelectedConnectionId(connection);
      setSql(`SELECT * FROM ${table} LIMIT 100;`);
    }
  }, [searchParams]);

  const handleExecute = async () => {
    if (dataSource === 'connections' && !selectedConnectionId) {
      setError('Please select a connection');
      return;
    }

    if (dataSource === 'staging' && !selectedStagingTable) {
      setError('Please select a staging table');
      return;
    }

    if (!sql.trim()) {
      setError('Please enter a SQL query');
      return;
    }

    setIsExecuting(true);
    setError(null);
    setQueryResult(null);

    try {
      let result: QueryResult;
      if (dataSource === 'staging') {
        result = await api.queries.executeStaging(sql.trim()) as QueryResult;
      } else {
        result = await api.queries.execute({
          connectionId: selectedConnectionId,
          sql: sql.trim(),
          cacheResults: false,
        }) as QueryResult;
      }

      setQueryResult(result);
      mutate('/query/history');
    } catch (err: any) {
      setError(err.message || 'Query execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Execute query with Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleStagingTableChange = (tableKey: string) => {
    setSelectedStagingTable(tableKey);
    if (tableKey) {
      const [schemaName, tableName] = tableKey.split('.');
      const fullTableName = `${schemaName}."${tableName}"`;
      setSql(`SELECT * FROM ${fullTableName} LIMIT 100;`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">SQL Query</h1>
        <p className="mt-2 text-gray-600">
          Execute SQL queries on your databases and staging data
        </p>
      </div>

      {/* Data Source Selector */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => {
                setDataSource('connections');
                setSelectedStagingTable('');
                setError(null);
              }}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                dataSource === 'connections'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Database Connections
            </button>
            <button
              onClick={() => {
                setDataSource('staging');
                setSelectedConnectionId('');
                setError(null);
              }}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                dataSource === 'staging'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Staging Data
            </button>
          </nav>
        </div>

        <div className="p-4">
          {dataSource === 'connections' ? (
            <>
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
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Staging Table *
              </label>
              <select
                value={selectedStagingTable}
                onChange={(e) => handleStagingTableChange(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
              >
                <option value="">-- Select a staging table --</option>
                {stagingTables?.map((table) => (
                  <option key={`${table.schema}.${table.name}`} value={`${table.schema}.${table.name}`}>
                    {table.name} ({formatBytes(table.sizeBytes)}{table.rowCount ? `, ${table.rowCount.toLocaleString()} rows` : ''})
                  </option>
                ))}
              </select>
              {!stagingTables || stagingTables.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">
                  No staging tables available.{' '}
                  <a href="/ingestion" className="text-indigo-600 hover:text-indigo-500">
                    Upload data to staging
                  </a>
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* SQL Editor */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              SQL Editor
            </h3>
            <button
              onClick={handleExecute}
              disabled={
                isExecuting ||
                (dataSource === 'connections' && !selectedConnectionId) ||
                (dataSource === 'staging' && !selectedStagingTable)
              }
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Executing...
                </>
              ) : (
                <>Execute (Ctrl+Enter)</>
              )}
            </button>
          </div>

          <SQLEditor
            value={sql}
            onChange={setSql}
            onKeyDown={handleKeyDown}
            disabled={isExecuting}
          />

          <p className="mt-2 text-xs text-gray-500">
            Tip: Press Ctrl+Enter (or Cmd+Enter on Mac) to execute the query
          </p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Query Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {queryResult && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Query Results
              </h3>
              <div className="text-sm text-gray-500">
                {queryResult.rowCount} rows in {queryResult.executionTimeMs}ms
              </div>
            </div>
            <ResultsTable result={queryResult} />
          </div>
        </div>
      )}
    </div>
  );
}
