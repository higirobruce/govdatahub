'use client';

import { useState, useEffect } from 'react';
import { QueryDefinition, ColumnSelection } from '@/types';

interface ColumnSelectorProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

export function ColumnSelector({
  queryDefinition,
  onQueryChange,
}: ColumnSelectorProps) {
  // Track which tables are expanded (default all to expanded)
  const [expandedTables, setExpandedTables] = useState<Set<string>>(
    new Set(queryDefinition.tables.map((t) => t.alias))
  );

  // Auto-expand new tables when they're added
  useEffect(() => {
    const currentAliases = new Set(queryDefinition.tables.map((t) => t.alias));
    const newExpanded = new Set(expandedTables);
    let hasChanges = false;

    // Add any new tables to expanded set
    currentAliases.forEach((alias) => {
      if (!newExpanded.has(alias)) {
        newExpanded.add(alias);
        hasChanges = true;
      }
    });

    // Remove tables that no longer exist
    expandedTables.forEach((alias) => {
      if (!currentAliases.has(alias)) {
        newExpanded.delete(alias);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setExpandedTables(newExpanded);
    }
  }, [queryDefinition.tables]);

  const toggleTableExpanded = (tableAlias: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableAlias)) {
      newExpanded.delete(tableAlias);
    } else {
      newExpanded.add(tableAlias);
    }
    setExpandedTables(newExpanded);
  };

  const handleToggleColumn = (table: string, column: string) => {
    const exists = queryDefinition.columns.some(
      (c) => c.table === table && c.column === column
    );

    let newColumns: ColumnSelection[];
    if (exists) {
      newColumns = queryDefinition.columns.filter(
        (c) => !(c.table === table && c.column === column)
      );
    } else {
      newColumns = [
        ...queryDefinition.columns,
        { table, column },
      ];
    }

    onQueryChange({
      ...queryDefinition,
      columns: newColumns,
    });
  };

  const handleSelectAllFromTable = (tableAlias: string) => {
    const table = queryDefinition.tables.find((t) => t.alias === tableAlias);
    if (!table || !table.columns) return;

    const tableColumns: ColumnSelection[] = table.columns.map((col) => ({
      table: tableAlias,
      column: col.name,
    }));

    // Remove existing columns from this table
    const otherColumns = queryDefinition.columns.filter((c) => c.table !== tableAlias);

    onQueryChange({
      ...queryDefinition,
      columns: [...otherColumns, ...tableColumns],
    });
  };

  const handleClearTable = (tableAlias: string) => {
    onQueryChange({
      ...queryDefinition,
      columns: queryDefinition.columns.filter((c) => c.table !== tableAlias),
    });
  };

  const isColumnSelected = (table: string, column: string) => {
    return queryDefinition.columns.some(
      (c) => c.table === table && c.column === column
    );
  };

  const handleUpdateAggregate = (index: number, aggregate: string | undefined) => {
    const newColumns = [...queryDefinition.columns];
    newColumns[index] = {
      ...newColumns[index],
      aggregate: aggregate as any,
    };
    onQueryChange({
      ...queryDefinition,
      columns: newColumns,
    });
  };

  const handleUpdateAlias = (index: number, alias: string) => {
    const newColumns = [...queryDefinition.columns];
    newColumns[index] = {
      ...newColumns[index],
      alias: alias || undefined,
    };
    onQueryChange({
      ...queryDefinition,
      columns: newColumns,
    });
  };

  if (queryDefinition.tables.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        Add tables to your query to select columns
      </div>
    );
  }

  const handleAddCountStar = () => {
    if (queryDefinition.tables.length === 0) return;
    const firstTable = queryDefinition.tables[0];

    // Add a COUNT(*) column using the first column of the first table
    const firstColumn = firstTable.columns?.[0];
    if (!firstColumn) return;

    onQueryChange({
      ...queryDefinition,
      columns: [
        ...queryDefinition.columns,
        {
          table: firstTable.alias,
          column: firstColumn.name,
          aggregate: 'COUNT' as any,
          alias: 'count',
        },
      ],
    });
  };

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleAddCountStar}
          disabled={queryDefinition.tables.length === 0}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add COUNT(*)
        </button>
      </div>

      {/* Selected Columns with Aggregates */}
      {queryDefinition.columns.length > 0 && (
        <div className="border border-blue-200 rounded-md bg-blue-50 p-3">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">
            Selected Columns ({queryDefinition.columns.length})
          </h4>
          <div className="space-y-2">
            {queryDefinition.columns.map((col, index) => (
              <div key={`${col.table}-${col.column}-${index}`} className="flex items-center gap-2 bg-white p-2 rounded border border-gray-200">
                {/* Column Name */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-gray-900 truncate">
                    {col.table}.{col.column}
                  </div>
                </div>

                {/* Aggregate Function */}
                <select
                  value={col.aggregate || ''}
                  onChange={(e) => handleUpdateAggregate(index, e.target.value || undefined)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 w-32"
                >
                  <option value="">No Aggregate</option>
                  <option value="COUNT">COUNT</option>
                  <option value="COUNT_DISTINCT">COUNT DISTINCT</option>
                  <option value="SUM">SUM</option>
                  <option value="AVG">AVG</option>
                  <option value="MIN">MIN</option>
                  <option value="MAX">MAX</option>
                </select>

                {/* Alias Input */}
                <input
                  type="text"
                  value={col.alias || ''}
                  onChange={(e) => handleUpdateAlias(index, e.target.value)}
                  placeholder="alias"
                  className="text-xs border border-gray-300 rounded px-2 py-1 w-24"
                />

                {/* Remove Button */}
                <button
                  onClick={() => handleToggleColumn(col.table, col.column)}
                  className="text-red-600 hover:text-red-700"
                  title="Remove column"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-600 mt-2">
            💡 Use aggregates with GROUP BY for COUNT, SUM, AVG, etc.
          </div>
        </div>
      )}

      {/* Available Columns */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-gray-700">Available Columns</h4>
      {queryDefinition.tables.map((table) => {
        const isExpanded = expandedTables.has(table.alias);

        return (
          <div key={table.alias} className="border border-gray-200 rounded-md overflow-hidden">
            {/* Table Header */}
            <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
              <button
                onClick={() => toggleTableExpanded(table.alias)}
                className="flex-1 min-w-0 flex items-center gap-2 text-left"
              >
                {/* Chevron Icon */}
                <svg
                  className={`w-4 h-4 text-gray-500 transition-transform ${
                    isExpanded ? 'transform rotate-90' : ''
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
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {table.alias}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {table.schemaName}.{table.tableName}
                  </div>
                </div>
              </button>
              <div className="flex gap-1">
                <button
                  onClick={() => handleSelectAllFromTable(table.alias)}
                  className="text-xs px-2 py-1 text-[#1a1a1a] hover:text-[#2a2a2a] font-medium"
                >
                  All
                </button>
                <button
                  onClick={() => handleClearTable(table.alias)}
                  className="text-xs px-2 py-1 text-gray-600 hover:text-gray-700 font-medium"
                >
                  None
                </button>
              </div>
            </div>

            {/* Columns List - Collapsible */}
            {isExpanded && (
              <div className="bg-white px-3 py-2 max-h-48 overflow-y-auto">
                {table.columns && table.columns.length > 0 ? (
                  <div className="space-y-1">
                    {table.columns.map((col) => (
                      <label
                        key={col.name}
                        className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isColumnSelected(table.alias, col.name)}
                          onChange={() => handleToggleColumn(table.alias, col.name)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-mono text-gray-900 truncate">
                            {col.name}
                          </span>
                          <span className="ml-2 text-xs text-gray-500">{col.type}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 py-2">Loading columns...</div>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
