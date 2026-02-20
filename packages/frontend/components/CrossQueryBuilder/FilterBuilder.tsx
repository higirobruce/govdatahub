'use client';

import { useState } from 'react';
import { QueryDefinition, FilterCondition } from '@/types';

interface FilterBuilderProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

export function FilterBuilder({
  queryDefinition,
  onQueryChange,
}: FilterBuilderProps) {
  const [showAddFilter, setShowAddFilter] = useState(false);

  const handleAddFilter = () => {
    const newFilter: FilterCondition = {
      table: queryDefinition.tables[0]?.alias || '',
      column: '',
      operator: '=',
      value: '',
    };

    onQueryChange({
      ...queryDefinition,
      filters: [...(queryDefinition.filters || []), newFilter],
    });
    setShowAddFilter(false);
  };

  const handleUpdateFilter = (
    index: number,
    field: keyof FilterCondition,
    value: any
  ) => {
    const newFilters = [...(queryDefinition.filters || [])];
    newFilters[index] = {
      ...newFilters[index],
      [field]: value,
    };

    // Clear value if operator is IS NULL or IS NOT NULL
    if (
      field === 'operator' &&
      (value === 'IS NULL' || value === 'IS NOT NULL')
    ) {
      newFilters[index].value = undefined;
    }

    onQueryChange({
      ...queryDefinition,
      filters: newFilters,
    });
  };

  const handleRemoveFilter = (index: number) => {
    const newFilters = (queryDefinition.filters || []).filter((_, i) => i !== index);
    onQueryChange({
      ...queryDefinition,
      filters: newFilters,
    });
  };

  const getColumnsForTable = (tableAlias: string) => {
    const table = queryDefinition.tables.find((t) => t.alias === tableAlias);
    return table?.columns || [];
  };

  const requiresValue = (operator: FilterCondition['operator']) => {
    return operator !== 'IS NULL' && operator !== 'IS NOT NULL';
  };

  if (queryDefinition.tables.length === 0) {
    return (
      <div className="text-sm text-gray-500">
        Add tables to your query to create filters
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Existing Filters */}
      {queryDefinition.filters && queryDefinition.filters.length > 0 && (
        <div className="space-y-2">
          {queryDefinition.filters.map((filter, index) => (
            <div
              key={index}
              className="flex items-start gap-2 p-3 bg-gray-50 border border-gray-200 rounded-md"
            >
              {/* Table Selector */}
              <select
                value={filter.table}
                onChange={(e) => handleUpdateFilter(index, 'table', e.target.value)}
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
                value={filter.column}
                onChange={(e) => handleUpdateFilter(index, 'column', e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="">Select column</option>
                {getColumnsForTable(filter.table).map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.name}
                  </option>
                ))}
              </select>

              {/* Operator Selector */}
              <select
                value={filter.operator}
                onChange={(e) => handleUpdateFilter(index, 'operator', e.target.value)}
                className="flex-none w-28 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value=">">{'>'}</option>
                <option value="<">{'<'}</option>
                <option value=">=">{'>='}</option>
                <option value="<=">{'<='}</option>
                <option value="LIKE">LIKE</option>
                <option value="IN">IN</option>
                <option value="IS NULL">IS NULL</option>
                <option value="IS NOT NULL">IS NOT NULL</option>
              </select>

              {/* Value Input */}
              {requiresValue(filter.operator) && (
                <input
                  type="text"
                  value={filter.value || ''}
                  onChange={(e) => handleUpdateFilter(index, 'value', e.target.value)}
                  placeholder="Value"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                />
              )}

              {/* Remove Button */}
              <button
                onClick={() => handleRemoveFilter(index)}
                className="flex-none text-red-600 hover:text-red-700"
                title="Remove filter"
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

      {/* Add Filter Button */}
      <button
        onClick={handleAddFilter}
        className="w-full px-3 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors"
      >
        + Add Filter
      </button>

      {/* Filter Summary */}
      {queryDefinition.filters && queryDefinition.filters.length > 0 && (
        <div className="text-xs text-gray-600 pt-2 border-t">
          {queryDefinition.filters.length} filter{queryDefinition.filters.length !== 1 ? 's' : ''} applied
        </div>
      )}
    </div>
  );
}
