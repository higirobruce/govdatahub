'use client';

import { QueryDefinition, GroupByClause } from '@/types';

interface GroupByBuilderProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

export function GroupByBuilder({
  queryDefinition,
  onQueryChange,
}: GroupByBuilderProps) {
  const handleAddGroupBy = () => {
    const newGroupBy: GroupByClause = {
      table: queryDefinition.tables[0]?.alias || '',
      column: '',
    };

    onQueryChange({
      ...queryDefinition,
      groupBy: [...(queryDefinition.groupBy || []), newGroupBy],
    });
  };

  const handleUpdateGroupBy = (
    index: number,
    field: keyof GroupByClause,
    value: any
  ) => {
    const newGroupBy = [...(queryDefinition.groupBy || [])];
    newGroupBy[index] = {
      ...newGroupBy[index],
      [field]: value,
    };

    onQueryChange({
      ...queryDefinition,
      groupBy: newGroupBy,
    });
  };

  const handleRemoveGroupBy = (index: number) => {
    const newGroupBy = (queryDefinition.groupBy || []).filter((_, i) => i !== index);
    onQueryChange({
      ...queryDefinition,
      groupBy: newGroupBy,
    });
  };

  const getColumnsForTable = (tableAlias: string) => {
    const table = queryDefinition.tables.find((t) => t.alias === tableAlias);
    return table?.columns || [];
  };

  if (queryDefinition.tables.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        Add tables to your query to create grouping
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Existing Group By Clauses */}
      {queryDefinition.groupBy && queryDefinition.groupBy.length > 0 && (
        <div className="space-y-2">
          {queryDefinition.groupBy.map((groupBy, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-md"
            >
              {/* Table Selector */}
              <select
                value={groupBy.table}
                onChange={(e) => handleUpdateGroupBy(index, 'table', e.target.value)}
                className="flex-none w-32 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                {queryDefinition.tables.map((table) => (
                  <option key={table.alias} value={table.alias}>
                    {table.alias}
                  </option>
                ))}
              </select>

              {/* Column Selector */}
              <select
                value={groupBy.column}
                onChange={(e) => handleUpdateGroupBy(index, 'column', e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="">Select column</option>
                {getColumnsForTable(groupBy.table).map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>

              {/* Remove Button */}
              <button
                onClick={() => handleRemoveGroupBy(index)}
                className="flex-none text-red-600 hover:text-red-700"
                title="Remove group"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Group By Button */}
      <button
        onClick={handleAddGroupBy}
        className="w-full px-3 py-2 text-sm font-medium text-[#1a1a1a] border border-[#dddddd] rounded-md hover:bg-[#f8f8f8] transition-colors"
      >
        + Add Group By
      </button>

      {/* Group By Summary */}
      {queryDefinition.groupBy && queryDefinition.groupBy.length > 0 && (
        <div className="text-xs text-gray-600 pt-2 border-t">
          Grouping by {queryDefinition.groupBy.length} column{queryDefinition.groupBy.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Help Text */}
      {queryDefinition.groupBy && queryDefinition.groupBy.length > 0 && (
        <div className="text-xs text-gray-500 italic">
          ℹ️ Use aggregate functions (COUNT, SUM, AVG, etc.) in selected columns
        </div>
      )}
    </div>
  );
}
