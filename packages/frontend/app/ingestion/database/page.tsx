'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Card, CardContent } from '@/components/ui/card';
import { Check, ChevronRight } from 'lucide-react';

type ImportTab = 'file' | 'database' | 'url';

interface Connection {
  id: string;
  name: string;
  type: string;
  database: string;
  host: string;
  port: number;
}

interface Table {
  name: string;
  schema: string;
}

interface Column {
  name: string;
  type: string;
}

type Step = 'connection' | 'table' | 'columns' | 'config';

interface StepConfig {
  id: Step;
  label: string;
  description: string;
}

const steps: StepConfig[] = [
  {
    id: 'connection',
    label: 'Select Connection',
    description: 'Choose database',
  },
  {
    id: 'table',
    label: 'Select Table',
    description: 'Choose source table',
  },
  {
    id: 'columns',
    label: 'Select Columns',
    description: 'Choose columns to import',
  },
  {
    id: 'config',
    label: 'Configure',
    description: 'Set import options',
  },
];

export default function DatabaseImportPage() {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<Step>('connection');

  // Form state
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedSchema, setSelectedSchema] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [whereClause, setWhereClause] = useState('');
  const [rowLimit, setRowLimit] = useState<number>(10000);
  const [targetTable, setTargetTable] = useState('');

  // UI state
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Data fetching
  const { data: connections } = useSWR<Connection[]>('/connections', async () => {
    const result = await api.connections.list();
    return result as Connection[];
  });

  const { data: tables } = useSWR<Table[]>(
    selectedConnectionId ? `/connections/${selectedConnectionId}/tables` : null,
    async () => {
      const result = await api.schema.getTables(selectedConnectionId);
      return result as Table[];
    }
  );

  const { data: columns } = useSWR<Column[]>(
    selectedConnectionId && selectedTable && selectedSchema
      ? `/connections/${selectedConnectionId}/tables/${selectedTable}/columns`
      : null,
    async () => {
      const result = await api.schema.getColumns(
        selectedConnectionId,
        selectedTable,
        selectedSchema
      );
      return result as Column[];
    }
  );

  // Auto-select all columns when table is selected
  useEffect(() => {
    if (columns && columns.length > 0 && selectedColumns.length === 0) {
      setSelectedColumns(columns.map(col => col.name));
    }
  }, [columns]);

  const handleSelectConnection = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    setSelectedSchema('');
    setSelectedTable('');
    setSelectedColumns([]);
    setStep('table');
  };

  const handleSelectTable = (table: Table) => {
    setSelectedSchema(table.schema);
    setSelectedTable(table.name);
    setTargetTable(`${table.schema}_${table.name}`);
    setStep('columns');
  };

  const handleToggleColumn = (columnName: string) => {
    setSelectedColumns(prev =>
      prev.includes(columnName)
        ? prev.filter(c => c !== columnName)
        : [...prev, columnName]
    );
  };

  const handleSelectAllColumns = () => {
    if (columns) {
      setSelectedColumns(columns.map(col => col.name));
    }
  };

  const handleDeselectAllColumns = () => {
    setSelectedColumns([]);
  };

  const handleTabChange = (tab: ImportTab) => {
    if (tab === 'file') {
      router.push('/ingestion');
    } else if (tab === 'url') {
      router.push('/ingestion/url');
    }
    // 'database' tab is current page, no navigation needed
  };

  const tabs = [
    {
      id: 'file' as ImportTab,
      label: 'Import from File',
      description: 'Upload CSV, Excel, or JSON files',
    },
    {
      id: 'database' as ImportTab,
      label: 'Import from Database',
      description: 'Import data from connected databases',
    },
    {
      id: 'url' as ImportTab,
      label: 'Import from URL',
      description: 'Download and import from URL',
    },
  ];

  const handleSubmit = async () => {
    setError(null);
    setIsImporting(true);

    try {
      await api.ingestion.importFromDatabase({
        connectionId: selectedConnectionId,
        schema: selectedSchema,
        table: selectedTable,
        columns: selectedColumns.length === columns?.length ? undefined : selectedColumns,
        whereClause: whereClause.trim() || undefined,
        rowLimit: rowLimit || undefined,
        targetTable: targetTable.trim() || undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        router.push('/ingestion');
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Failed to start import');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Data Ingestion</h1>
        <p className="mt-2 text-gray-600">
          Import data from multiple sources into your data hub
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white shadow sm:rounded-lg mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`
                  flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm
                  ${
                    tab.id === 'database'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <div>
                  <div className="font-semibold">{tab.label}</div>
                  <div className="text-xs mt-1 opacity-75">{tab.description}</div>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Stepper */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {steps.map((stepConfig, index) => {
              const currentStepIndex = steps.findIndex((s) => s.id === step);
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <div key={stepConfig.id} className="flex items-center flex-1">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold transition-colors ${
                        isCompleted
                          ? 'bg-primary text-primary-foreground border-primary'
                          : isCurrent
                          ? 'border-primary text-primary'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div>
                      <p
                        className={`font-semibold text-sm ${
                          index <= currentStepIndex
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {stepConfig.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {stepConfig.description}
                      </p>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <ChevronRight className="h-5 w-5 mx-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <div className="min-h-[500px]">
        <Card>
          <div className="px-4 py-5 sm:p-6">
            {/* Step 1: Select Connection */}
          {step === 'connection' && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Database Connection
              </h2>
              {!connections || connections.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No connections available.{' '}
                  <a href="/connections" className="text-indigo-600 hover:text-indigo-500">
                    Create one first
                  </a>
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {connections.map(conn => (
                    <button
                      key={conn.id}
                      onClick={() => handleSelectConnection(conn.id)}
                      className="text-left p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      <div className="font-medium text-gray-900">{conn.name}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {conn.type} - {conn.database}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {conn.host}:{conn.port}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Table */}
          {step === 'table' && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Select Table
              </h2>
              {!tables || tables.length === 0 ? (
                <p className="text-sm text-gray-500">Loading tables...</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                  {tables.map(table => (
                    <button
                      key={`${table.schema}.${table.name}`}
                      onClick={() => handleSelectTable(table)}
                      className="text-left p-3 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                    >
                      <div className="font-medium text-gray-900 truncate">
                        {table.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{table.schema}</div>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <button
                  onClick={() => setStep('connection')}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  ← Back to connections
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Select Columns */}
          {step === 'columns' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">
                  Select Columns
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleSelectAllColumns}
                    className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAllColumns}
                    className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              {!columns || columns.length === 0 ? (
                <p className="text-sm text-gray-500">Loading columns...</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                  {columns.map(column => (
                    <label
                      key={column.name}
                      className="flex items-start gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(column.name)}
                        onChange={() => handleToggleColumn(column.name)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {column.name}
                        </div>
                        <div className="text-xs text-gray-500">{column.type}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setStep('table')}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  ← Back to tables
                </button>
                <button
                  onClick={() => setStep('config')}
                  disabled={selectedColumns.length === 0}
                  className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Configuration */}
          {step === 'config' && (
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Configure Import
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Target Table Name
                  </label>
                  <input
                    type="text"
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                    placeholder={`${selectedSchema}_${selectedTable}`}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    WHERE Clause (optional)
                  </label>
                  <input
                    type="text"
                    value={whereClause}
                    onChange={(e) => setWhereClause(e.target.value)}
                    placeholder="e.g., status = 'active' AND created_at > '2024-01-01'"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Filter rows to import (SQL WHERE syntax)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Row Limit (optional)
                  </label>
                  <input
                    type="number"
                    value={rowLimit}
                    onChange={(e) => setRowLimit(parseInt(e.target.value) || 0)}
                    placeholder="10000"
                    min="1"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum number of rows to import
                  </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Summary</h3>
                  <dl className="text-sm space-y-1">
                    <div className="flex">
                      <dt className="text-gray-500 w-24">Connection:</dt>
                      <dd className="text-gray-900 font-medium">
                        {connections?.find(c => c.id === selectedConnectionId)?.name}
                      </dd>
                    </div>
                    <div className="flex">
                      <dt className="text-gray-500 w-24">Table:</dt>
                      <dd className="text-gray-900 font-medium">
                        {selectedSchema}.{selectedTable}
                      </dd>
                    </div>
                    <div className="flex">
                      <dt className="text-gray-500 w-24">Columns:</dt>
                      <dd className="text-gray-900">
                        {selectedColumns.length === columns?.length
                          ? 'All columns'
                          : `${selectedColumns.length} of ${columns?.length}`}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4">
                    <div className="text-sm text-red-800">{error}</div>
                  </div>
                )}

                {/* Success Display */}
                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <div className="text-sm text-green-800">
                      Import started successfully! Redirecting...
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => setStep('columns')}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isImporting}
                  className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? 'Starting Import...' : 'Start Import'}
                </button>
              </div>
            </div>
          )}
          </div>
        </Card>
      </div>
    </div>
  );
}
