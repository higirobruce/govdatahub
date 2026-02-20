'use client';

import { useState, useEffect } from 'react';
import { QueryDefinition, CrossQueryResult } from '@/types';
import { ConnectionSelector } from '@/components/CrossQueryBuilder/ConnectionSelector';
import { TableBrowser } from '@/components/CrossQueryBuilder/TableBrowser';
import { VisualJoinEditor } from '@/components/CrossQueryBuilder/VisualJoinEditor';
import { ColumnSelector } from '@/components/CrossQueryBuilder/ColumnSelector';
import { FilterBuilder } from '@/components/CrossQueryBuilder/FilterBuilder';
import { OrderByBuilder } from '@/components/CrossQueryBuilder/OrderByBuilder';
import { QueryPreview } from '@/components/CrossQueryBuilder/QueryPreview';
import { ResultsViewer } from '@/components/CrossQueryBuilder/ResultsViewer';
import { SavedQueriesPanel } from '@/components/CrossQueryBuilder/SavedQueriesPanel';
import { api } from '@/lib/api';

type SidebarTab = 'connections' | 'filters' | 'sorting' | 'saved';

export default function CrossQueryPage() {
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('connections');
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
  const [isSqlPreviewCollapsed, setIsSqlPreviewCollapsed] = useState(false);
  const [isRightContentCollapsed, setIsRightContentCollapsed] = useState(false);

  // Load column metadata when tables are added
  useEffect(() => {
    const loadColumnsForTables = async () => {
      const updatedTables = await Promise.all(
        queryDefinition.tables.map(async (table) => {
          if (table.columns && table.columns.length > 0) {
            return table; // Already has columns
          }

          try {
            let columns;
            if (table.connectionId === 'staging') {
              // Use staging columns endpoint
              columns = await api.schema.getStagingColumns(table.tableName);
            } else {
              // Use regular connection columns endpoint
              columns = await api.schema.getColumns(
                table.connectionId,
                table.tableName,
                table.schemaName
              );
            }
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
      // Clean queryDefinition before sending - remove columns property from tables
      // (columns are only for UI display, backend doesn't expect them)
      const cleanedQueryDefinition = {
        ...queryDefinition,
        tables: queryDefinition.tables.map(({ columns, ...table }) => table),
      };

      const response = await api.crossQuery.execute({ queryDefinition: cleanedQueryDefinition });
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
        <div className={`bg-white border-r flex flex-col overflow-hidden transition-all ${isRightContentCollapsed ? 'flex-1' : 'w-[23rem]'}`}>
          {/* Sidebar Tabs */}
          <div className="border-b bg-gray-50">
            <nav className="flex">
              <button
                onClick={() => setSidebarTab('connections')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'connections'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                📊 Data
              </button>
              <button
                onClick={() => setSidebarTab('filters')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'filters'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                🔍 Filter
              </button>
              <button
                onClick={() => setSidebarTab('sorting')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'sorting'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                ↕️ Sort
              </button>
              <button
                onClick={() => setSidebarTab('saved')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'saved'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                💾 Saved
              </button>
            </nav>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Connections & Tables Tab */}
            {sidebarTab === 'connections' && (
              <div className="space-y-4">
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
                      <div>Filters: {queryDefinition.filters?.length || 0}</div>
                      <div>Sorting: {queryDefinition.orderBy?.length || 0} columns</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Filters Tab */}
            {sidebarTab === 'filters' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  WHERE Filters
                </h3>
                <FilterBuilder
                  queryDefinition={queryDefinition}
                  onQueryChange={setQueryDefinition}
                />
              </div>
            )}

            {/* Sorting Tab */}
            {sidebarTab === 'sorting' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  ORDER BY Sorting
                </h3>
                <OrderByBuilder
                  queryDefinition={queryDefinition}
                  onQueryChange={setQueryDefinition}
                />
              </div>
            )}

            {/* Saved Queries Tab */}
            {sidebarTab === 'saved' && (
              <div>
                <SavedQueriesPanel
                  currentQuery={queryDefinition}
                  onLoadQuery={(loadedQuery) => {
                    setQueryDefinition(loadedQuery);
                    setSidebarTab('connections');
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Center/Right Content */}
        <div className={`flex flex-col overflow-hidden transition-all ${isRightContentCollapsed ? 'w-[32rem]' : 'flex-1'}`}>
          {/* Collapse/Expand Button Bar */}
          <div className="bg-white border-b px-4 py-2 flex justify-end">
            <button
              onClick={() => setIsRightContentCollapsed(!isRightContentCollapsed)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={isRightContentCollapsed ? 'Expand content area' : 'Collapse content area'}
            >
              <svg
                className={`w-4 h-4 text-gray-600 transition-transform ${isRightContentCollapsed ? 'rotate-180' : ''}`}
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
          </div>

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
            <div className={`h-64 flex gap-4 p-4 bg-gray-50 overflow-hidden ${isSqlPreviewCollapsed ? '' : ''}`}>
              {/* Column Selector */}
              <div className={`bg-white border rounded-lg p-4 overflow-y-auto ${isSqlPreviewCollapsed ? 'flex-1' : 'w-1/2'}`}>
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
                <div className={`bg-white border rounded-lg overflow-hidden transition-all ${isSqlPreviewCollapsed ? 'w-12' : 'flex-1'}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h3 className={`text-sm font-semibold text-gray-900 ${isSqlPreviewCollapsed ? 'hidden' : ''}`}>
                      SQL Preview
                    </h3>
                    <button
                      onClick={() => setIsSqlPreviewCollapsed(!isSqlPreviewCollapsed)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title={isSqlPreviewCollapsed ? 'Expand SQL Preview' : 'Collapse SQL Preview'}
                    >
                      <svg
                        className={`w-4 h-4 text-gray-600 transition-transform ${isSqlPreviewCollapsed ? 'rotate-180' : ''}`}
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
                  </div>
                  {!isSqlPreviewCollapsed && (
                    <div className="p-4 overflow-hidden">
                      <QueryPreview queryDefinition={queryDefinition} />
                    </div>
                  )}
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
