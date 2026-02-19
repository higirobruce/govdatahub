'use client';

import { useState, useEffect } from 'react';
import { QueryDefinition, CrossQueryResult } from '@/types';
import { ConnectionSelector } from '@/components/CrossQueryBuilder/ConnectionSelector';
import { TableBrowser } from '@/components/CrossQueryBuilder/TableBrowser';
import { VisualJoinEditor } from '@/components/CrossQueryBuilder/VisualJoinEditor';
import { ColumnSelector } from '@/components/CrossQueryBuilder/ColumnSelector';
import { QueryPreview } from '@/components/CrossQueryBuilder/QueryPreview';
import { ResultsViewer } from '@/components/CrossQueryBuilder/ResultsViewer';
import { api } from '@/lib/api';

export default function CrossQueryPage() {
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  const [queryDefinition, setQueryDefinition] = useState<QueryDefinition>({
    tables: [],
    joins: [],
    columns: [],
    filters: [],
    orderBy: [],
    limit: 100,
  });
  const [result, setResult] = useState<CrossQueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load column metadata when tables are added
  useEffect(() => {
    const loadColumnsForTables = async () => {
      const updatedTables = await Promise.all(
        queryDefinition.tables.map(async (table) => {
          if (table.columns && table.columns.length > 0) {
            return table; // Already has columns
          }

          try {
            const columns = await api.schema.getColumns(
              table.connectionId,
              table.schemaName,
              table.tableName
            );
            return { ...table, columns: columns as any[] };
          } catch (err) {
            console.error(`Failed to load columns for ${table.tableName}:`, err);
            return table;
          }
        })
      );

      // Only update if columns actually changed
      const hasChanges = updatedTables.some(
        (updated, index) =>
          !queryDefinition.tables[index].columns ||
          queryDefinition.tables[index].columns!.length !== updated.columns?.length
      );

      if (hasChanges) {
        setQueryDefinition((prev) => ({
          ...prev,
          tables: updatedTables,
        }));
      }
    };

    if (queryDefinition.tables.length > 0) {
      loadColumnsForTables();
    }
  }, [queryDefinition.tables.map((t) => t.alias).join(',')]);

  const handleExecute = async () => {
    // Validate query has required components
    if (queryDefinition.tables.length === 0) {
      setError('Please add at least one table');
      return;
    }

    if (queryDefinition.columns.length === 0) {
      setError('Please select at least one column');
      return;
    }

    if (queryDefinition.tables.length > 1 && queryDefinition.joins.length === 0) {
      setError('Multiple tables require joins');
      return;
    }

    setError(null);
    setIsExecuting(true);

    try {
      const response = await api.crossQuery.execute({ queryDefinition });
      setResult(response as CrossQueryResult);
    } catch (err: any) {
      setError(err.message || 'Failed to execute query');
      setResult(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const canExecute =
    queryDefinition.tables.length > 0 &&
    queryDefinition.columns.length > 0 &&
    (queryDefinition.tables.length === 1 || queryDefinition.joins.length > 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Cross-Database Query Builder
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Join data from multiple databases using visual query builder
            </p>
          </div>
          {canExecute && (
            <button
              onClick={handleExecute}
              disabled={isExecuting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <>
                  <svg
                    className="-ml-1 mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Execute Query
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="flex">
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
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 bg-white border-r overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Connection Selector */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Select Connections
              </h3>
              <ConnectionSelector
                selectedConnections={selectedConnections}
                onSelectionChange={setSelectedConnections}
              />
            </div>

            {/* Table Browser */}
            {selectedConnections.length > 0 && (
              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Browse Tables
                </h3>
                <TableBrowser
                  connectionIds={selectedConnections}
                  queryDefinition={queryDefinition}
                  onQueryChange={setQueryDefinition}
                />
              </div>
            )}

            {/* Query Settings */}
            {queryDefinition.tables.length > 0 && (
              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Query Settings
                </h3>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Result Limit
                  </label>
                  <input
                    type="number"
                    value={queryDefinition.limit || 100}
                    onChange={(e) =>
                      setQueryDefinition({
                        ...queryDefinition,
                        limit: parseInt(e.target.value) || 100,
                      })
                    }
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
                    min="1"
                    max="10000"
                  />
                </div>
                <div className="mt-3 text-xs text-gray-600 space-y-1">
                  <div>Tables: {queryDefinition.tables.length}</div>
                  <div>Joins: {queryDefinition.joins.length}</div>
                  <div>Columns: {queryDefinition.columns.length}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center/Right Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Visual Join Editor */}
          {queryDefinition.tables.length > 0 && (
            <div className="flex-1 bg-white border-b p-4 overflow-hidden">
              <VisualJoinEditor
                queryDefinition={queryDefinition}
                onQueryChange={setQueryDefinition}
              />
            </div>
          )}

          {/* Bottom Section - Column Selector and Preview */}
          {queryDefinition.tables.length > 0 && (
            <div className="h-64 grid grid-cols-2 gap-4 p-4 bg-gray-50 overflow-hidden">
              {/* Column Selector */}
              <div className="bg-white border rounded-lg p-4 overflow-y-auto">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Select Columns
                </h3>
                <ColumnSelector
                  queryDefinition={queryDefinition}
                  onQueryChange={setQueryDefinition}
                />
              </div>

              {/* Query Preview */}
              {queryDefinition.columns.length > 0 && (
                <div className="bg-white border rounded-lg p-4 overflow-hidden">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    SQL Preview
                  </h3>
                  <QueryPreview queryDefinition={queryDefinition} />
                </div>
              )}
            </div>
          )}

          {/* Results Viewer */}
          {result && (
            <div className="flex-1 bg-white p-4 overflow-auto">
              <ResultsViewer result={result} />
            </div>
          )}

          {/* Empty State */}
          {queryDefinition.tables.length === 0 && !result && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">
                  Cross-Database Query Builder
                </h3>
                <p className="mt-2 text-sm text-gray-600 max-w-md">
                  Select connections from the sidebar to start building your cross-database query
                </p>
                <div className="mt-4 space-y-2 text-sm text-gray-500">
                  <p>✓ Select multiple database connections</p>
                  <p>✓ Add tables to your query</p>
                  <p>✓ Create joins with drag-and-drop</p>
                  <p>✓ Select columns visually</p>
                  <p>✓ Execute and view results</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
