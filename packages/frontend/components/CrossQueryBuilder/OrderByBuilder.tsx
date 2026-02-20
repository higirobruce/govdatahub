'use client';

import { QueryDefinition, OrderByClause } from '@/types';

interface OrderByBuilderProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

export function OrderByBuilder({
  queryDefinition,
  onQueryChange,
}: OrderByBuilderProps) {
  const handleAddOrderBy = () => {
    const newOrderBy: OrderByClause = {
      table: queryDefinition.tables[0]?.alias || '',
      column: '',
      direction: 'ASC',
    };

    onQueryChange({
      ...queryDefinition,
      orderBy: [...(queryDefinition.orderBy || []), newOrderBy],
    });
  };

  const handleUpdateOrderBy = (
    index: number,
    field: keyof OrderByClause,
    value: any
  ) => {
    const newOrderBy = [...(queryDefinition.orderBy || [])];
    newOrderBy[index] = {
      ...newOrderBy[index],
      [field]: value,
    };

    onQueryChange({
      ...queryDefinition,
      orderBy: newOrderBy,
    });
  };

  const handleRemoveOrderBy = (index: number) => {
    const newOrderBy = (queryDefinition.orderBy || []).filter((_, i) => i !== index);
    onQueryChange({
      ...queryDefinition,
      orderBy: newOrderBy,
    });
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newOrderBy = [...(queryDefinition.orderBy || [])];
    [newOrderBy[index - 1], newOrderBy[index]] = [newOrderBy[index], newOrderBy[index - 1]];
    onQueryChange({
      ...queryDefinition,
      orderBy: newOrderBy,
    });
  };

  const handleMoveDown = (index: number) => {
    const orderBy = queryDefinition.orderBy || [];
    if (index === orderBy.length - 1) return;
    const newOrderBy = [...orderBy];
    [newOrderBy[index], newOrderBy[index + 1]] = [newOrderBy[index + 1], newOrderBy[index]];
    onQueryChange({
      ...queryDefinition,
      orderBy: newOrderBy,
    });
  };

  const getColumnsForTable = (tableAlias: string) => {
    const table = queryDefinition.tables.find((t) => t.alias === tableAlias);
    return table?.columns || [];
  };

  if (queryDefinition.tables.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        Add tables to your query to create sorting
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Existing Order By Clauses */}
      {queryDefinition.orderBy && queryDefinition.orderBy.length > 0 && (
        <div className="space-y-2">
          {queryDefinition.orderBy.map((orderBy, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-md"
            >
              {/* Order Priority Indicator */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={index === (queryDefinition.orderBy?.length || 0) - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Priority Number */}
              <div className="flex-none w-6 text-center text-sm font-medium text-gray-600">
                {index + 1}
              </div>

              {/* Table Selector */}
              <select
                value={orderBy.table}
                onChange={(e) => handleUpdateOrderBy(index, 'table', e.target.value)}
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
                value={orderBy.column}
                onChange={(e) => handleUpdateOrderBy(index, 'column', e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="">Select column</option>
                {getColumnsForTable(orderBy.table).map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>

              {/* Direction Selector */}
              <select
                value={orderBy.direction}
                onChange={(e) => handleUpdateOrderBy(index, 'direction', e.target.value)}
                className="flex-none w-24 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="ASC">ASC ↑</option>
                <option value="DESC">DESC ↓</option>
              </select>

              {/* Remove Button */}
              <button
                onClick={() => handleRemoveOrderBy(index)}
                className="flex-none text-red-600 hover:text-red-700"
                title="Remove sort"
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

      {/* Add Order By Button */}
      <button
        onClick={handleAddOrderBy}
        className="w-full px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors"
      >
        + Add Sort
      </button>

      {/* Order By Summary */}
      {queryDefinition.orderBy && queryDefinition.orderBy.length > 0 && (
        <div className="text-xs text-gray-600 pt-2 border-t">
          Sorting by {queryDefinition.orderBy.length} column{queryDefinition.orderBy.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Help Text */}
      {queryDefinition.orderBy && queryDefinition.orderBy.length > 1 && (
        <div className="text-xs text-gray-500 italic">
          ℹ️ Order matters - results sort by priority (1, 2, 3...)
        </div>
      )}
    </div>
  );
}
