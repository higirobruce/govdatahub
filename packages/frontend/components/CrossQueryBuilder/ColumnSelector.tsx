'use client';

import { useEffect, useState } from 'react';
import { QueryDefinition, ColumnSelection, ColumnMetadata } from '@/types/cross-query';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Columns, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

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
    <div className="space-y-6 max-h-[400px] overflow-y-auto">
      {tableColumns.map((tableCol) => {
        const allSelected = tableCol.columns.every((col) =>
          isColumnSelected(tableCol.alias, col.name)
        );

        return (
          <div key={tableCol.alias} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Columns className="h-4 w-4" />
                {tableCol.alias} ({tableCol.tableName})
              </h3>
              <button
                onClick={() => selectAllFromTable(tableCol.alias, tableCol.columns)}
                className="text-xs text-primary hover:underline"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pl-4">
              {tableCol.columns.map((column) => (
                <div
                  key={column.name}
                  className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent"
                >
                  <Checkbox
                    id={`${tableCol.alias}.${column.name}`}
                    checked={isColumnSelected(tableCol.alias, column.name)}
                    onCheckedChange={() => toggleColumn(tableCol.alias, column.name)}
                  />
                  <Label
                    htmlFor={`${tableCol.alias}.${column.name}`}
                    className="text-sm cursor-pointer flex-1"
                  >
                    <div>{column.name}</div>
                    <div className="text-xs text-muted-foreground">{column.type}</div>
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {queryDefinition.columns.length > 0 && (
        <p className="text-xs text-muted-foreground mt-4">
          {queryDefinition.columns.length} column(s) selected
        </p>
      )}
    </div>
  );
}
