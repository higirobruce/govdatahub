'use client';

import { useEffect, useState } from 'react';
import { QueryDefinition, ColumnSelection, ColumnMetadata } from '@/types/cross-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Columns, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

// Color palette for tables
const TABLE_COLORS = [
  'bg-blue-100 border-blue-300 text-blue-900',
  'bg-green-100 border-green-300 text-green-900',
  'bg-purple-100 border-purple-300 text-purple-900',
  'bg-orange-100 border-orange-300 text-orange-900',
  'bg-pink-100 border-pink-300 text-pink-900',
  'bg-cyan-100 border-cyan-300 text-cyan-900',
  'bg-yellow-100 border-yellow-300 text-yellow-900',
  'bg-red-100 border-red-300 text-red-900',
];

interface TableColumns {
  alias: string;
  tableName: string;
  columns: ColumnMetadata[];
}

interface ColumnSelectorProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (query: QueryDefinition) => void;
}

export function ColumnSelector({
  queryDefinition,
  onQueryChange,
}: ColumnSelectorProps) {
  const [tableColumns, setTableColumns] = useState<TableColumns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedTables, setCollapsedTables] = useState<Set<string>>(new Set());

  const toggleTableCollapse = (tableAlias: string) => {
    const newCollapsed = new Set(collapsedTables);
    if (newCollapsed.has(tableAlias)) {
      newCollapsed.delete(tableAlias);
    } else {
      newCollapsed.add(tableAlias);
    }
    setCollapsedTables(newCollapsed);
  };

  const getTableColor = (index: number) => {
    return TABLE_COLORS[index % TABLE_COLORS.length];
  };

  useEffect(() => {
    loadColumns();
  }, [queryDefinition.tables]);

  const loadColumns = async () => {
    if (queryDefinition.tables.length === 0) {
      setTableColumns([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const promises = queryDefinition.tables.map(async (table) => {
        const columns = await api.schema.getColumns(
          table.connectionId,
          table.tableName,
          table.schemaName
        );

        return {
          alias: table.alias,
          tableName: table.tableName,
          columns: columns as ColumnMetadata[],
        };
      });

      const results = await Promise.all(promises);
      setTableColumns(results);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load columns');
    } finally {
      setLoading(false);
    }
  };

  const toggleColumn = (tableAlias: string, columnName: string) => {
    const existingIndex = queryDefinition.columns.findIndex(
      (col) => col.table === tableAlias && col.column === columnName
    );

    let newColumns: ColumnSelection[];

    if (existingIndex >= 0) {
      // Remove column
      newColumns = queryDefinition.columns.filter((_, i) => i !== existingIndex);
    } else {
      // Add column
      newColumns = [
        ...queryDefinition.columns,
        {
          table: tableAlias,
          column: columnName,
        },
      ];
    }

    onQueryChange({
      ...queryDefinition,
      columns: newColumns,
    });
  };

  const isColumnSelected = (tableAlias: string, columnName: string) => {
    return queryDefinition.columns.some(
      (col) => col.table === tableAlias && col.column === columnName
    );
  };

  const selectAllFromTable = (tableAlias: string, columns: ColumnMetadata[]) => {
    const allSelected = columns.every((col) => isColumnSelected(tableAlias, col.name));

    let newColumns = queryDefinition.columns.filter((col) => col.table !== tableAlias);

    if (!allSelected) {
      // Add all columns from this table
      const tableColumns = columns.map((col) => ({
        table: tableAlias,
        column: col.name,
      }));
      newColumns = [...newColumns, ...tableColumns];
    }

    onQueryChange({
      ...queryDefinition,
      columns: newColumns,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (tableColumns.length === 0) {
    return (
      <Alert>
        <AlertDescription>Add tables to select columns</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      {tableColumns.map((tableCol, index) => {
        const allSelected = tableCol.columns.every((col) =>
          isColumnSelected(tableCol.alias, col.name)
        );
        const isCollapsed = collapsedTables.has(tableCol.alias);
        const colorClass = getTableColor(index);
        const selectedCount = tableCol.columns.filter((col) =>
          isColumnSelected(tableCol.alias, col.name)
        ).length;

        return (
          <div key={tableCol.alias} className={`border rounded-md ${colorClass}`}>
            {/* Table Header - Collapsible */}
            <div
              className="flex items-center justify-between p-2 cursor-pointer hover:opacity-80"
              onClick={() => toggleTableCollapse(tableCol.alias)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                )}
                <Columns className="h-3 w-3 flex-shrink-0" />
                <h3 className="text-xs font-semibold truncate">
                  {tableCol.alias}
                  <span className="font-normal text-xs ml-1">
                    ({selectedCount}/{tableCol.columns.length})
                  </span>
                </h3>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  selectAllFromTable(tableCol.alias, tableCol.columns);
                }}
                className="text-xs hover:underline flex-shrink-0"
              >
                {allSelected ? 'Clear' : 'All'}
              </button>
            </div>

            {/* Columns List - Collapsible */}
            {!isCollapsed && (
              <div className="border-t border-current/20 p-2 bg-white/50">
                <div className="space-y-1">
                  {tableCol.columns.map((column) => (
                    <div
                      key={column.name}
                      className="flex items-center space-x-2 p-1 rounded hover:bg-white/80"
                    >
                      <Checkbox
                        id={`${tableCol.alias}.${column.name}`}
                        checked={isColumnSelected(tableCol.alias, column.name)}
                        onCheckedChange={() => toggleColumn(tableCol.alias, column.name)}
                      />
                      <Label
                        htmlFor={`${tableCol.alias}.${column.name}`}
                        className="text-xs cursor-pointer flex-1 min-w-0"
                      >
                        <div className="truncate font-medium">{column.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {column.type}
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {queryDefinition.columns.length > 0 && (
        <p className="text-xs text-muted-foreground pt-2 border-t mt-2">
          {queryDefinition.columns.length} column(s) selected
        </p>
      )}
    </div>
  );
}
