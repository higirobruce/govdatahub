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
import { Link as LinkIcon } from 'lucide-react';

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
    <div className="h-screen flex flex-col bg-[#f2f2f2]">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <LinkIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1a1a1a]">
                Cross-Database Query Builder
              </h1>
              <p className="text-sm text-[#555555] mt-1">
                Join data from multiple databases using visual query builder
              </p>
            </div>
          </div>
          {canExecute && (
            <button
              onClick={handleExecute}
              disabled={isExecuting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-subtle text-white bg-[#1a1a1a] hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="bg-[#fee2e2] border-b border-[#fca5a5] px-6 py-3">
          <div className="flex">
            <svg
              className="h-5 w-5 text-[#ef4444]"
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
              <p className="text-sm text-[#991b1b]">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className={`bg-white border-r flex flex-col overflow-hidden transition-all ${isRightContentCollapsed ? 'flex-1' : 'w-[23rem]'}`}>
          {/* Sidebar Tabs */}
          <div className="border-b bg-[#f8f8f8]">
            <nav className="flex">
              <button
                onClick={() => setSidebarTab('connections')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'connections'
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#555555] hover:text-[#1a1a1a]'
                }`}
              >
                📊 Data
              </button>
              <button
                onClick={() => setSidebarTab('filters')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'filters'
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#555555] hover:text-[#1a1a1a]'
                }`}
              >
                🔍 Filter
              </button>
              <button
                onClick={() => setSidebarTab('sorting')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'sorting'
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#555555] hover:text-[#1a1a1a]'
                }`}
              >
                ↕️ Sort
              </button>
              <button
                onClick={() => setSidebarTab('saved')}
                className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                  sidebarTab === 'saved'
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#555555] hover:text-[#1a1a1a]'
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
                  <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2">
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
                    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2">
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
                    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2">
                      Query Settings
                    </h3>
                    <div>
                      <label className="block text-xs font-medium text-[#555555] mb-1">
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
                        className="w-full px-2 py-1 text-sm border border-[#dddddd] rounded-md focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
                        min="1"
                        max="10000"
                      />
                    </div>
                    <div className="mt-3 text-xs text-[#555555] space-y-1">
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
                <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">
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
                <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">
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
              className="p-1 hover:bg-[#f8f8f8] rounded transition-colors"
              title={isRightContentCollapsed ? 'Expand content area' : 'Collapse content area'}
            >
              <svg
                className={`w-4 h-4 text-[#555555] transition-transform ${isRightContentCollapsed ? 'rotate-180' : ''}`}
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
            <div className={`h-64 flex gap-4 p-4 bg-[#f2f2f2] overflow-hidden ${isSqlPreviewCollapsed ? '' : ''}`}>
              {/* Column Selector */}
              <div className={`bg-white border rounded-lg p-4 overflow-y-auto ${isSqlPreviewCollapsed ? 'flex-1' : 'w-1/2'}`}>
                <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3">
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
                    <h3 className={`text-sm font-semibold text-[#1a1a1a] ${isSqlPreviewCollapsed ? 'hidden' : ''}`}>
                      SQL Preview
                    </h3>
                    <button
                      onClick={() => setIsSqlPreviewCollapsed(!isSqlPreviewCollapsed)}
                      className="p-1 hover:bg-[#f8f8f8] rounded transition-colors"
                      title={isSqlPreviewCollapsed ? 'Expand SQL Preview' : 'Collapse SQL Preview'}
                    >
                      <svg
                        className={`w-4 h-4 text-[#555555] transition-transform ${isSqlPreviewCollapsed ? 'rotate-180' : ''}`}
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
              <div className="text-center text-[#aaaaaa]">
                <svg
                  className="mx-auto h-16 w-16 text-[#aaaaaa]"
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
                <h3 className="mt-4 text-lg font-medium text-[#1a1a1a]">
                  Cross-Database Query Builder
                </h3>
                <p className="mt-2 text-sm text-[#555555] max-w-md">
                  Select connections from the sidebar to start building your cross-database query
                </p>
                <div className="mt-4 space-y-2 text-sm text-[#aaaaaa]">
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
