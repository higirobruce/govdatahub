'use client';

import { useEffect, useState } from 'react';
import { QueryDefinition, TableReference } from '@/types/cross-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Table as TableIcon, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface TableInfo {
  schema: string;
  name: string;
  type: string;
}

interface ConnectionTables {
  connectionId: string;
  connectionName: string;
  tables: TableInfo[];
}

interface TableBrowserProps {
  connectionIds: string[];
  queryDefinition: QueryDefinition;
  onQueryChange: (query: QueryDefinition) => void;
}

export function TableBrowser({
  connectionIds,
  queryDefinition,
  onQueryChange,
}: TableBrowserProps) {
  const [tablesByConnection, setTablesByConnection] = useState<ConnectionTables[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTables();
  }, [connectionIds]);

  const loadTables = async () => {
    if (connectionIds.length === 0) {
      setTablesByConnection([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Load tables for each connection
      const promises = connectionIds.map(async (connId) => {
        const [connData, tablesData] = await Promise.all([
          api.connections.get(connId),
          api.schema.getTables(connId),
        ]);

        return {
          connectionId: connId,
          connectionName: (connData as any).name,
          tables: tablesData as TableInfo[],
        };
      });

      const results = await Promise.all(promises);
      setTablesByConnection(results);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load tables');
    } finally {
      setLoading(false);
    }
  };

  const addTable = (connectionId: string, connectionName: string, table: TableInfo) => {
    // Generate alias from table name (t1, t2, etc. or actual table name)
    const existingAliases = queryDefinition.tables.map((t) => t.alias);
    let alias = table.name;
    let counter = 1;
    while (existingAliases.includes(alias)) {
      alias = `${table.name}_${counter}`;
      counter++;
    }

    const newTable: TableReference = {
      connectionId,
      schemaName: table.schema,
      tableName: table.name,
      alias,
    };

    onQueryChange({
      ...queryDefinition,
      tables: [...queryDefinition.tables, newTable],
    });
  };

  const isTableAdded = (connectionId: string, tableName: string) => {
    return queryDefinition.tables.some(
      (t) => t.connectionId === connectionId && t.tableName === tableName
    );
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

  if (tablesByConnection.length === 0) {
    return (
      <Alert>
        <AlertDescription>Select connections to browse tables</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4 max-h-[500px] overflow-y-auto">
      {tablesByConnection.map((conn) => (
        <div key={conn.connectionId} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {conn.connectionName}
          </h3>
          <div className="space-y-1">
            {conn.tables.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-4">No tables found</p>
            ) : (
              conn.tables.map((table) => {
                const added = isTableAdded(conn.connectionId, table.name);
                return (
                  <div
                    key={`${table.schema}.${table.name}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-accent"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <TableIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {table.schema}.{table.name}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={added ? 'secondary' : 'ghost'}
                      onClick={() =>
                        !added && addTable(conn.connectionId, conn.connectionName, table)
                      }
                      disabled={added}
                      className="h-7"
                    >
                      {added ? (
                        'Added'
                      ) : (
                        <>
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
