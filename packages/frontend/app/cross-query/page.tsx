'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { QueryDefinition, CrossQueryResult } from '@/types';
import { ConnectionSelector } from '@/components/CrossQueryBuilder/ConnectionSelector';
import { TableBrowser } from '@/components/CrossQueryBuilder/TableBrowser';
import { VisualJoinEditor } from '@/components/CrossQueryBuilder/VisualJoinEditor';
import { ColumnSelector } from '@/components/CrossQueryBuilder/ColumnSelector';
import { FilterBuilder } from '@/components/CrossQueryBuilder/FilterBuilder';
import { OrderByBuilder } from '@/components/CrossQueryBuilder/OrderByBuilder';
import { GroupByBuilder } from '@/components/CrossQueryBuilder/GroupByBuilder';
import { LimitBuilder } from '@/components/CrossQueryBuilder/LimitBuilder';
import { QueryPreview } from '@/components/CrossQueryBuilder/QueryPreview';
import { ResultsViewer } from '@/components/CrossQueryBuilder/ResultsViewer';
import { SavedQueriesPanel } from '@/components/CrossQueryBuilder/SavedQueriesPanel';
import { api } from '@/lib/api';
import { Link as LinkIcon } from 'lucide-react';

export default function CrossQueryPage() {
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['data-sources', 'query-operations'])
  );
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
  const [leftPanelWidth, setLeftPanelWidth] = useState(368); // 23rem = 368px
  const isResizingRef = useRef(false);
  const animationFrameRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle resizing with smooth animation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current || !containerRef.current) return;

      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Use requestAnimationFrame for smooth updates
      animationFrameRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;

        // Calculate width relative to the container's left edge
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;

        // Apply constraints: min 280px, max 600px
        const clampedWidth = Math.min(Math.max(newWidth, 200), 400);
        setLeftPanelWidth(clampedWidth);
      });
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Cancel any pending animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      }
    };

    // Add listeners to document
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Clean up animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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
    <div className="h-full w-full flex flex-col bg-[#f2f2f2] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex-shrink-0 max-w-full">
        <div className="flex items-center justify-between min-w-0">
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
        <div className="bg-[#fee2e2] border-b border-[#fca5a5] px-6 py-3 flex-shrink-0 max-w-full">
          <div className="flex min-w-0">
            <svg
              className="h-5 w-5 text-[#ef4444] flex-shrink-0"
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
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm text-[#991b1b] break-words">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden w-full max-w-full">
        {/* Left Sidebar */}
        <div
          className="bg-white border-r flex flex-col overflow-hidden flex-shrink-0"
          style={{ width: isRightContentCollapsed ? '100%' : `${leftPanelWidth}px` }}
        >
          {/* Sidebar Content - Grouped Sections */}
          <div className="flex-1 overflow-y-auto">
            {/* DATA SOURCES Section */}
            <div className="border-b">
              <button
                onClick={() => {
                  const newSet = new Set(expandedSections);
                  if (newSet.has('data-sources')) {
                    newSet.delete('data-sources');
                  } else {
                    newSet.add('data-sources');
                  }
                  setExpandedSections(newSet);
                }}
                className="w-full px-4 py-2 bg-[#f8f8f8] hover:bg-[#eeeeee] transition-colors flex items-center justify-between"
              >
                <span className="text-xs font-bold text-[#1a1a1a] tracking-wide">DATA SOURCES</span>
                <svg
                  className={`w-4 h-4 text-[#555555] transition-transform ${
                    expandedSections.has('data-sources') ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.has('data-sources') && (
                <div className="p-4 space-y-4">
                  {/* Connection Selector */}
                  <div>
                    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2">Select Connections</h3>
                    <ConnectionSelector
                      selectedConnections={selectedConnections}
                      onSelectionChange={setSelectedConnections}
                    />
                  </div>

                  {/* Table Browser */}
                  {selectedConnections.length > 0 && (
                    <div className="pt-4 border-t">
                      <h3 className="text-sm font-semibold text-[#1a1a1a] mb-2">Browse Tables</h3>
                      <TableBrowser
                        connectionIds={selectedConnections}
                        queryDefinition={queryDefinition}
                        onQueryChange={setQueryDefinition}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* QUERY OPERATIONS Section */}
            <div className="border-b">
              <button
                onClick={() => {
                  const newSet = new Set(expandedSections);
                  if (newSet.has('query-operations')) {
                    newSet.delete('query-operations');
                  } else {
                    newSet.add('query-operations');
                  }
                  setExpandedSections(newSet);
                }}
                className="w-full px-4 py-2 bg-[#f8f8f8] hover:bg-[#eeeeee] transition-colors flex items-center justify-between"
              >
                <span className="text-xs font-bold text-[#1a1a1a] tracking-wide">QUERY OPERATIONS</span>
                <svg
                  className={`w-4 h-4 text-[#555555] transition-transform ${
                    expandedSections.has('query-operations') ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.has('query-operations') && (
                <div className="divide-y">
                  {/* Filters */}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2">
                      <span>🔍</span> WHERE Filters
                    </h3>
                    <FilterBuilder queryDefinition={queryDefinition} onQueryChange={setQueryDefinition} />
                  </div>

                  {/* Group By */}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2">
                      <span>📦</span> GROUP BY
                    </h3>
                    <GroupByBuilder queryDefinition={queryDefinition} onQueryChange={setQueryDefinition} />
                  </div>

                  {/* Sorting */}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2">
                      <span>↕️</span> ORDER BY
                    </h3>
                    <OrderByBuilder queryDefinition={queryDefinition} onQueryChange={setQueryDefinition} />
                  </div>

                  {/* Limit */}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2">
                      <span>🔢</span> LIMIT
                    </h3>
                    <LimitBuilder queryDefinition={queryDefinition} onQueryChange={setQueryDefinition} />
                  </div>
                </div>
              )}
            </div>

            {/* SAVED QUERIES Section */}
            <div className="border-b">
              <button
                onClick={() => {
                  const newSet = new Set(expandedSections);
                  if (newSet.has('saved-queries')) {
                    newSet.delete('saved-queries');
                  } else {
                    newSet.add('saved-queries');
                  }
                  setExpandedSections(newSet);
                }}
                className="w-full px-4 py-2 bg-[#f8f8f8] hover:bg-[#eeeeee] transition-colors flex items-center justify-between"
              >
                <span className="text-xs font-bold text-[#1a1a1a] tracking-wide">SAVED QUERIES</span>
                <svg
                  className={`w-4 h-4 text-[#555555] transition-transform ${
                    expandedSections.has('saved-queries') ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.has('saved-queries') && (
                <div className="p-4">
                  <SavedQueriesPanel
                    currentQuery={queryDefinition}
                    onLoadQuery={(loadedQuery) => {
                      setQueryDefinition(loadedQuery);
                    }}
                  />
                </div>
              )}
            </div>

            {/* QUERY SUMMARY Section */}
            {queryDefinition.tables.length > 0 && (
              <div className="border-b">
                <button
                  onClick={() => {
                    const newSet = new Set(expandedSections);
                    if (newSet.has('query-summary')) {
                      newSet.delete('query-summary');
                    } else {
                      newSet.add('query-summary');
                    }
                    setExpandedSections(newSet);
                  }}
                  className="w-full px-4 py-2 bg-[#f8f8f8] hover:bg-[#eeeeee] transition-colors flex items-center justify-between"
                >
                  <span className="text-xs font-bold text-[#1a1a1a] tracking-wide">QUERY SUMMARY</span>
                  <svg
                    className={`w-4 h-4 text-[#555555] transition-transform ${
                      expandedSections.has('query-summary') ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSections.has('query-summary') && (
                  <div className="p-4">
                    <div className="text-xs text-[#555555] space-y-1">
                      <div>Tables: {queryDefinition.tables.length}</div>
                      <div>Joins: {queryDefinition.joins.length}</div>
                      <div>Columns: {queryDefinition.columns.length}</div>
                      <div>Filters: {queryDefinition.filters?.length || 0}</div>
                      <div>Group By: {queryDefinition.groupBy?.length || 0} columns</div>
                      <div>Sorting: {queryDefinition.orderBy?.length || 0} columns</div>
                      <div>Limit: {queryDefinition.limit ? queryDefinition.limit.toLocaleString() : 'None'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Resizer Bar */}
        {!isRightContentCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 transition-colors"
          />
        )}

        {/* Center/Right Content */}
        <div className="flex flex-col overflow-hidden flex-1 min-w-0 max-w-full">
          {/* Collapse/Expand Button Bar */}
          <div className="bg-white border-b px-4 py-2 flex justify-end flex-shrink-0">
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
            <div className="flex-1 bg-white border-b overflow-hidden min-w-0 max-w-full min-h-0">
              <div className="w-full h-full p-4">
                <VisualJoinEditor
                  queryDefinition={queryDefinition}
                  onQueryChange={setQueryDefinition}
                />
              </div>
            </div>
          )}

          {/* Bottom Section - Column Selector and Preview */}
          {queryDefinition.tables.length > 0 && (
            <div className={`h-64 flex gap-4 p-4 bg-[#f2f2f2] flex-shrink-0 max-w-full ${isSqlPreviewCollapsed ? '' : ''}`}>
              {/* Column Selector */}
              <div className={`bg-white border rounded-lg p-4 overflow-y-auto flex-shrink min-w-0 ${isSqlPreviewCollapsed ? 'flex-1' : 'w-1/2'}`}>
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
                <div className={`bg-white border rounded-lg flex flex-col transition-all flex-shrink min-w-0 max-w-full ${isSqlPreviewCollapsed ? 'w-12' : 'flex-1'}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
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
                    <div className="flex-1 p-4 overflow-auto min-h-0 min-w-0 max-w-full">
                      <QueryPreview queryDefinition={queryDefinition} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Results Viewer */}
          {result && (
            <div className="bg-white overflow-hidden min-w-0 max-w-full flex flex-col">
              <div className="overflow-y-auto p-4 max-w-[60rem] min-w-full">
                <ResultsViewer result={result} />
              </div>
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
