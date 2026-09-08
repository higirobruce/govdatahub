'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { SchemaInfo, TableInfo, ColumnInfo } from '@/types';
import { TableProfilePanel } from '@/components/quality/TableProfilePanel';
import { BarChart2, Loader2 } from 'lucide-react';

interface SchemaTreeProps {
  connectionId: string;
  onQueryTable: (table: string, schema?: string) => void;
}

export default function SchemaTree({
  connectionId,
  onQueryTable,
}: SchemaTreeProps) {
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    new Set()
  );
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null);

  const { data: schemas, error: schemasError } = useSWR<SchemaInfo[]>(
    connectionId ? `/connections/${connectionId}/schemas` : null,
    () => api.schema.getSchemas(connectionId) as Promise<SchemaInfo[]>
  );

  const { data: tables, error: tablesError } = useSWR<TableInfo[]>(
    selectedSchema ? `/connections/${connectionId}/tables/${selectedSchema}` : null,
    () => api.schema.getTables(connectionId, selectedSchema || undefined) as Promise<TableInfo[]>
  );

  const toggleSchema = (schemaName: string) => {
    const newExpanded = new Set(expandedSchemas);
    if (newExpanded.has(schemaName)) {
      newExpanded.delete(schemaName);
    } else {
      newExpanded.add(schemaName);
    }
    setExpandedSchemas(newExpanded);
    setSelectedSchema(schemaName);
  };

  if (schemasError) {
    return <div className="text-red-600 text-sm">Failed to load schemas</div>;
  }

  if (!schemas) {
    return <div className="text-gray-500 text-sm">Loading schemas...</div>;
  }

  return (
    <div className="space-y-2">
      {schemas.map((schema) => (
        <SchemaNode
          key={schema.name}
          schema={schema}
          connectionId={connectionId}
          isExpanded={expandedSchemas.has(schema.name)}
          onToggle={() => toggleSchema(schema.name)}
          tables={selectedSchema === schema.name ? tables : undefined}
          expandedTables={expandedTables}
          setExpandedTables={setExpandedTables}
          onQueryTable={onQueryTable}
        />
      ))}
    </div>
  );
}

interface SchemaNodeProps {
  schema: SchemaInfo;
  connectionId: string;
  isExpanded: boolean;
  onToggle: () => void;
  tables?: TableInfo[];
  expandedTables: Set<string>;
  setExpandedTables: (tables: Set<string>) => void;
  onQueryTable: (table: string, schema?: string) => void;
}

function SchemaNode({
  schema,
  connectionId,
  isExpanded,
  onToggle,
  tables,
  expandedTables,
  setExpandedTables,
  onQueryTable,
}: SchemaNodeProps) {
  return (
    <div>
      <div
        className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
        onClick={onToggle}
      >
        <span className="text-gray-400">
          {isExpanded ? '▼' : '▶'}
        </span>
        <svg
          className="h-5 w-5 text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <span className="font-medium text-gray-900">{schema.name}</span>
      </div>

      {isExpanded && (
        <div className="ml-6 mt-1">
          {!tables && <div className="text-gray-500 text-sm p-2">Loading tables...</div>}
          {tables && tables.length === 0 && (
            <div className="text-gray-500 text-sm p-2">No tables found</div>
          )}
          {tables && tables.map((table) => (
            <TableNode
              key={`${table.schema}.${table.name}`}
              table={table}
              connectionId={connectionId}
              isExpanded={expandedTables.has(`${table.schema}.${table.name}`)}
              onToggle={() => {
                const key = `${table.schema}.${table.name}`;
                const newExpanded = new Set(expandedTables);
                if (newExpanded.has(key)) {
                  newExpanded.delete(key);
                } else {
                  newExpanded.add(key);
                }
                setExpandedTables(newExpanded);
              }}
              onQueryTable={onQueryTable}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TableNodeProps {
  table: TableInfo;
  connectionId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onQueryTable: (table: string, schema?: string) => void;
}

function TableNode({
  table,
  connectionId,
  isExpanded,
  onToggle,
  onQueryTable,
}: TableNodeProps) {
  const [profileData, setProfileData] = useState<any>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  const handleProfile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProfileLoading(true);
    setProfileData(null);
    try {
      const result = await api.dataQuality.profileTable({
        connectionId,
        schemaName: table.schema,
        tableName: table.name,
      });
      setProfileData(result);
    } catch {
      setProfileData({ status: 'error', errorMessage: 'Profiling failed', columnProfiles: [] });
    } finally {
      setIsProfileLoading(false);
    }
  };

  const { data: columns } = useSWR<ColumnInfo[]>(
    isExpanded ? `/connections/${connectionId}/tables/${table.name}/columns` : null,
    () => api.schema.getColumns(connectionId, table.name, table.schema) as Promise<ColumnInfo[]>
  );

  // Helper to determine if a column name needs quoting (has uppercase, special chars, or is a reserved word)
  const needsQuoting = (columnName: string): boolean => {
    // Check if contains uppercase letters
    if (columnName !== columnName.toLowerCase()) {
      return true;
    }
    // Check if contains special characters (anything other than lowercase letters, numbers, underscore)
    if (!/^[a-z0-9_]+$/.test(columnName)) {
      return true;
    }
    return false;
  };

  const formatColumnName = (columnName: string): string => {
    return needsQuoting(columnName) ? `"${columnName}"` : columnName;
  };

  return (
    <div className="my-1">
      <div className="flex items-center justify-between group p-2 hover:bg-gray-50 rounded">
        <div
          className="flex items-center space-x-2 flex-1 cursor-pointer"
          onClick={onToggle}
        >
          <span className="text-gray-400">
            {isExpanded ? '▼' : '▶'}
          </span>
          <svg
            className="h-4 w-4 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span className="text-sm text-gray-700">{table.name}</span>
          <span className="text-xs text-gray-400">({table.type})</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQueryTable(table.name, table.schema);
            }}
            className="text-xs px-2 py-1 text-[#1a1a1a] hover:text-[#2a2a2a]"
          >
            Query
          </button>
          <button
            onClick={handleProfile}
            disabled={isProfileLoading}
            className="text-xs px-2 py-1 text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
            title="Profile table columns"
          >
            {isProfileLoading
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <BarChart2 className="h-3 w-3" />}
            Profile
          </button>
        </div>
      </div>

      {(isProfileLoading || profileData) && (
        <div className="ml-6 mt-1">
          <TableProfilePanel profile={profileData} isLoading={isProfileLoading} />
        </div>
      )}

      {isExpanded && (
        <div className="ml-6 mt-1">
          {!columns && <div className="text-gray-500 text-xs p-2">Loading columns...</div>}
          {columns && columns.length === 0 && (
            <div className="text-gray-500 text-xs p-2">No columns found</div>
          )}
          {columns && columns.map((column) => {
            const requiresQuoting = needsQuoting(column.name);
            const displayName = formatColumnName(column.name);

            return (
              <div
                key={column.name}
                className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded text-xs group/col"
                title={requiresQuoting ? `Use in SQL as: ${displayName}` : undefined}
              >
                <svg
                  className={`h-3 w-3 ${column.isPrimaryKey ? 'text-yellow-500' : 'text-gray-400'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  {column.isPrimaryKey ? (
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6z" />
                  ) : (
                    <circle cx="10" cy="10" r="3" />
                  )}
                </svg>
                <span className={`font-mono ${requiresQuoting ? 'text-blue-700' : 'text-gray-700'}`}>
                  {displayName}
                </span>
                {requiresQuoting && (
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded">
                    quote
                  </span>
                )}
                <span className="text-gray-500">
                  {column.type}
                  {!column.nullable && <span className="text-red-600 ml-1">*</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
