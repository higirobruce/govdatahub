'use client';

import { QueryDefinition, ColumnSelection } from '@/types';

interface ColumnSelectorProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

export function ColumnSelector({
  queryDefinition,
  onQueryChange,
}: ColumnSelectorProps) {
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

  if (queryDefinition.tables.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        Add tables to your query to select columns
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {queryDefinition.tables.map((table) => (
        <div key={table.alias} className="border border-gray-200 rounded-md overflow-hidden">
          {/* Table Header */}
          <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {table.alias}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {table.schemaName}.{table.tableName}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => handleSelectAllFromTable(table.alias)}
                className="text-xs px-2 py-1 text-indigo-600 hover:text-indigo-700 font-medium"
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

          {/* Columns List */}
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
        </div>
      ))}

      {/* Summary */}
      {queryDefinition.columns.length > 0 && (
        <div className="text-xs text-gray-600 pt-2 border-t">
          {queryDefinition.columns.length} column{queryDefinition.columns.length !== 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  );
}
