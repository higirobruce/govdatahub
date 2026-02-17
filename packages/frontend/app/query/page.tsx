'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Connection, QueryResult } from '@/types';
import SQLEditor from '@/components/QueryInterface/SQLEditor';
import ResultsTable from '@/components/QueryInterface/ResultsTable';

export default function QueryPage() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [sql, setSql] = useState('SELECT * FROM ');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const { data: connections } = useSWR<Connection[]>('/connections', () =>
    api.connections.list()
  );

  const handleExecute = async () => {
    if (!selectedConnectionId) {
      setError('Please select a connection');
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
      const result = await api.queries.execute({
        connectionId: selectedConnectionId,
        sql: sql.trim(),
        cacheResults: false,
      });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">SQL Query</h1>
        <p className="mt-2 text-gray-600">
          Execute SQL queries on your connected databases
        </p>
      </div>

      {/* Connection Selector */}
      <div className="bg-white shadow sm:rounded-lg p-4">
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
        {!connections || connections.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">
            No connections available.{' '}
            <a href="/connections" className="text-indigo-600 hover:text-indigo-500">
              Create one first
            </a>
          </p>
        )}
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
              disabled={isExecuting || !selectedConnectionId}
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
