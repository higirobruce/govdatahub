'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Connection, QueryResult } from '@/types';
import SQLEditor from '@/components/QueryInterface/SQLEditor';
import ResultsTable from '@/components/QueryInterface/ResultsTable';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Play, AlertCircle, BarChart3, LayoutDashboard, Search, Sparkles, Code, Download } from 'lucide-react';
import { QueryVisualization } from '@/components/QueryVisualization';
import { AddToDashboardModal } from '@/components/DashboardBuilder/AddToDashboardModal';
import { useToast } from '@/components/ui/toast';
import { OrganizationSettings } from '@/types/settings';
import { exportQueryResultsToCsv, exportQueryResultsToJson, exportQueryResultsToExcel } from '@/lib/export-utils';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';

type DataSource = 'connections' | 'staging';
type EditorMode = 'sql' | 'nl';

interface StagingTable {
  name: string;
  schema: string;
  rowCount: number | null;
  sizeBytes: number;
}

export default function QueryPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const [dataSource, setDataSource] = useState<DataSource>('connections');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [selectedStagingTable, setSelectedStagingTable] = useState<string>('');
  const [sql, setSql] = useState('SELECT * FROM ');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showVisualization, setShowVisualization] = useState(false);
  const [showAddToDashboard, setShowAddToDashboard] = useState(false);

  // NL2SQL state
  const [editorMode, setEditorMode] = useState<EditorMode>('sql');
  const [nlQuery, setNlQuery] = useState('');
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [sqlWarnings, setSqlWarnings] = useState<string[]>([]);

  const { data: connections } = useSWR<Connection[]>('/connections', async () => {
    const result = await api.connections.list();
    return result as Connection[];
  });

  const { data: stagingTables } = useSWR<StagingTable[]>(
    dataSource === 'staging' ? '/schema/staging/tables' : null,
    async () => {
      const result = await api.schema.getStagingTables();
      return result as StagingTable[];
    }
  );

  // Fetch organization settings for NL2SQL
  const { data: settings } = useSWR<OrganizationSettings>('/settings', () => api.settings.get());

  // Handle URL parameters from catalog
  useEffect(() => {
    const staging = searchParams?.get('staging');
    const table = searchParams?.get('table');
    const schema = searchParams?.get('schema');
    const connection = searchParams?.get('connection');

    if (staging === 'true') {
      setDataSource('staging');
      if (table && schema) {
        setSelectedStagingTable(`${schema}.${table}`);
        setSql(`SELECT * FROM ${schema}."${table}" LIMIT 100;`);
      } else if (table) {
        setSql(`SELECT * FROM ${table} LIMIT 100;`);
      }
    } else if (connection && table) {
      setDataSource('connections');
      setSelectedConnectionId(connection);
      setSql(`SELECT * FROM ${table} LIMIT 100;`);
    }
  }, [searchParams]);

  const handleExecute = async () => {
    if (dataSource === 'connections' && !selectedConnectionId) {
      setError('Please select a connection');
      return;
    }

    if (dataSource === 'staging' && !selectedStagingTable) {
      setError('Please select a staging table');
      return;
    }

    if (!sql.trim()) {
      setError('Please enter a SQL query');
      return;
    }

    setIsExecuting(true);
    setError(null);
    setQueryResult(null);

    try {
      let result: QueryResult;
      if (dataSource === 'staging') {
        result = await api.queries.executeStaging(sql.trim()) as QueryResult;
      } else {
        result = await api.queries.execute({
          connectionId: selectedConnectionId,
          sql: sql.trim(),
          cacheResults: false,
        }) as QueryResult;
      }

      setQueryResult(result);
      mutate('/query/history');
    } catch (err: any) {
      setError(err.message || 'Query execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Execute query with Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleGenerateSql = async () => {
    if (!nlQuery.trim()) {
      setError('Please enter a natural language query');
      return;
    }

    if (!settings?.nl2sqlEnabled) {
      setError('NL2SQL feature is not enabled. Please enable it in Settings.');
      return;
    }

    if (dataSource === 'connections' && !selectedConnectionId) {
      setError('Please select a connection');
      return;
    }

    setIsGeneratingSql(true);
    setError(null);
    setAiReasoning(null);
    setSqlWarnings([]);

    try {
      const response = await api.nl2sql.generateSql({
        query: nlQuery,
        connectionIds: selectedConnectionId ? [selectedConnectionId] : undefined,
        autoExecute: false,
      });

      // Set generated SQL
      setSql(response.sql);

      // Show reasoning if available
      if (response.reasoning) {
        setAiReasoning(response.reasoning);
      }

      // Show warnings if any
      if (response.warnings && response.warnings.length > 0) {
        setSqlWarnings(response.warnings);
      }

      // Show validation errors if any
      if (response.validationErrors && response.validationErrors.length > 0) {
        setError(`SQL Validation Failed:\n${response.validationErrors.join('\n')}`);
      } else {
        showToast('SQL generated successfully! Review and execute when ready.', 'success');
        // Switch to SQL mode to show generated query
        setEditorMode('sql');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate SQL');
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleStagingTableChange = (tableKey: string) => {
    setSelectedStagingTable(tableKey);
    if (tableKey) {
      const [schemaName, tableName] = tableKey.split('.');
      const fullTableName = `${schemaName}."${tableName}"`;
      setSql(`SELECT * FROM ${fullTableName} LIMIT 100;`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
  };

  return (
    <div className="w-full max-w-full">
      <PageHeader
        title="SQL Query"
        subtitle="Execute SQL queries on your databases and staging data"
        icon={Search}
      />

      {/* Data Source Selector */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
        <div className="border-b border-[#f0f0f0]">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => {
                setDataSource('connections');
                setSelectedStagingTable('');
                setError(null);
              }}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${dataSource === 'connections'
                ? 'border-[#1a1a1a] text-[#1a1a1a]'
                : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
                }`}
            >
              Database Connections
            </button>
            <button
              onClick={() => {
                setDataSource('staging');
                setSelectedConnectionId('');
                setError(null);
              }}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${dataSource === 'staging'
                ? 'border-[#1a1a1a] text-[#1a1a1a]'
                : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
                }`}
            >
              Staging Data
            </button>
          </nav>
        </div>

        <div className="p-6">
          {dataSource === 'connections' ? (
            <>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                Select Database Connection *
              </label>
              <select
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
              >
                <option value="">-- Select a connection --</option>
                {connections?.map((conn) => (
                  <option key={conn.id} value={conn.id}>
                    {conn.name} ({conn.type} - {conn.database})
                  </option>
                ))}
              </select>
              {!connections || connections.length === 0 ? (
                <p className="mt-2 text-sm text-[#aaaaaa]">
                  No connections available.{' '}
                  <a href="/connections" className="text-[#1a1a1a] hover:underline font-medium">
                    Create one first
                  </a>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-[#555555] mb-2">
                Select Staging Table *
              </label>
              <select
                value={selectedStagingTable}
                onChange={(e) => handleStagingTableChange(e.target.value)}
                className="block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
                title="Select a staging table"
              >
                <option value="">-- Select a staging table --</option>
                {stagingTables?.map((table) => (
                  <option
                    key={`${table.schema}.${table.name}`}
                    value={`${table.schema}.${table.name}`}
                    title={`Full table name: ${table.schema}.${table.name}`}
                  >
                    {table.name} ({formatBytes(table.sizeBytes)}{table.rowCount ? `, ${table.rowCount.toLocaleString()} rows` : ''})
                  </option>
                ))}
              </select>
              {!stagingTables || stagingTables.length === 0 ? (
                <p className="mt-2 text-sm text-[#aaaaaa]">
                  No staging tables available.{' '}
                  <a href="/ingestion" className="text-[#1a1a1a] hover:underline font-medium">
                    Upload data to staging
                  </a>
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Query Editor */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
        {/* Mode Toggle */}
        <div className="border-b border-[#f0f0f0]">
          <nav className="-mb-px flex" aria-label="Editor Mode">
            <button
              onClick={() => setEditorMode('sql')}
              className={`flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                editorMode === 'sql'
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
              }`}
            >
              <Code className="w-4 h-4" />
              SQL Editor
            </button>
            <button
              onClick={() => setEditorMode('nl')}
              className={`flex-1 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                editorMode === 'nl'
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
              }`}
              disabled={!settings?.nl2sqlEnabled}
              title={!settings?.nl2sqlEnabled ? 'NL2SQL is not enabled. Enable it in Settings.' : ''}
            >
              <Sparkles className="w-4 h-4" />
              Natural Language {!settings?.nl2sqlEnabled && '(Disabled)'}
            </button>
          </nav>
        </div>

        <div className="px-6 py-5">
          {editorMode === 'sql' ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-[#1a1a1a]">SQL Editor</h3>
                <Button
                  onClick={handleExecute}
                  disabled={
                    isExecuting ||
                    (dataSource === 'connections' && !selectedConnectionId) ||
                    (dataSource === 'staging' && !selectedStagingTable)
                  }
                >
                  {isExecuting ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Execute (Ctrl+Enter)
                    </>
                  )}
                </Button>
              </div>

              <SQLEditor
                value={sql}
                onChange={setSql}
                onKeyDown={handleKeyDown}
                disabled={isExecuting}
              />

              <div className="mt-3 space-y-2">
                <p className="text-xs text-[#aaaaaa]">
                  <span className="font-medium">Tip:</span> Press Ctrl+Enter (or Cmd+Enter on Mac) to execute the query
                </p>
                <div className="flex items-start gap-2 bg-[#eff6ff] border border-[#bfdbfe] rounded-md px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-[#3b82f6] flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-[#1e40af]">
                    <span className="font-semibold">Column Name Case Sensitivity:</span> PostgreSQL lowercases unquoted column names.
                    If your column has mixed case (e.g., <code className="bg-white px-1 py-0.5 rounded font-mono">employmentStatus</code>),
                    wrap it in double quotes: <code className="bg-white px-1 py-0.5 rounded font-mono">"employmentStatus"</code>
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Natural Language Editor */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-[#1a1a1a]">Natural Language Query</h3>
                <Button
                  onClick={handleGenerateSql}
                  disabled={
                    isGeneratingSql ||
                    (dataSource === 'connections' && !selectedConnectionId) ||
                    (dataSource === 'staging' && !selectedStagingTable)
                  }
                >
                  {isGeneratingSql ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Generating SQL...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate SQL
                    </>
                  )}
                </Button>
              </div>

              <Textarea
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                placeholder="Describe what data you want to retrieve in plain English...&#10;&#10;Example: Show me all customers who made purchases in the last 30 days"
                className="min-h-[120px] text-sm"
                disabled={isGeneratingSql}
              />

              <div className="mt-3 space-y-2">
                <p className="text-xs text-[#aaaaaa]">
                  <span className="font-medium">Tip:</span> Be specific about what data you want, filters, and sorting
                </p>
                <div className="flex items-start gap-2 bg-[#f0fdf4] border border-[#bbf7d0] rounded-md px-3 py-2">
                  <Sparkles className="w-4 h-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-[#15803d]">
                    <span className="font-semibold">AI-Powered:</span> Your natural language query will be converted to SQL using AI.
                    Review the generated SQL before executing.
                  </p>
                </div>
              </div>

              {/* AI Reasoning Display */}
              {aiReasoning && (
                <div className="mt-4 bg-[#fef3c7] border border-[#fde047] rounded-md p-3">
                  <p className="text-xs font-semibold text-[#854d0e] mb-1">AI Reasoning:</p>
                  <p className="text-xs text-[#854d0e] whitespace-pre-wrap">{aiReasoning}</p>
                </div>
              )}

              {/* SQL Warnings */}
              {sqlWarnings.length > 0 && (
                <div className="mt-4 bg-[#fef3c7] border border-[#fde047] rounded-md p-3">
                  <p className="text-xs font-semibold text-[#854d0e] mb-1">Warnings:</p>
                  <ul className="text-xs text-[#854d0e] list-disc list-inside space-y-1">
                    {sqlWarnings.map((warning, idx) => (
                      <li key={idx}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-[#fee2e2] border border-[#fca5a5] rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-[#ef4444]" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-[#991b1b]">Query Error</h3>
              <div className="mt-2 text-sm text-[#991b1b]">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {queryResult && (
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-semibold text-[#1a1a1a]">
                Query Results
              </h3>
              <div className="flex items-center gap-4">
                <Button
                  onClick={() => setShowVisualization(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <BarChart3 className="h-4 w-4" />
                  Visualize
                </Button>
                <Button
                  onClick={() => setShowAddToDashboard(true)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Add to Dashboard
                </Button>
                <DropdownMenu
                  trigger={
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                  }
                >
                  <DropdownMenuItem onClick={() => exportQueryResultsToCsv(queryResult)}>
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportQueryResultsToJson(queryResult)}>
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportQueryResultsToExcel(queryResult)}>
                    Export as Excel
                  </DropdownMenuItem>
                </DropdownMenu>
                <div className="text-sm text-[#aaaaaa]">
                  {queryResult.rowCount} rows in {queryResult.executionTimeMs}ms
                </div>
              </div>
            </div>
            <div className='w-full max-w-[80vw] overflow-auto'>
              <ResultsTable result={queryResult} /></div>
          </div>
        </div>
      )}

      {/* Visualization Modal */}
      {showVisualization && queryResult && (
        <QueryVisualization
          queryResult={queryResult}
          onClose={() => setShowVisualization(false)}
        />
      )}

      {/* Add to Dashboard Modal */}
      {showAddToDashboard && queryResult && (
        <AddToDashboardModal
          queryResult={queryResult}
          onClose={() => setShowAddToDashboard(false)}
          onAdd={(chartConfig) => {
            // Save chart to localStorage for now (later: save to backend)
            const existingCharts = JSON.parse(localStorage.getItem('pendingDashboardCharts') || '[]');
            existingCharts.push(chartConfig);
            localStorage.setItem('pendingDashboardCharts', JSON.stringify(existingCharts));

            showToast(`Chart "${chartConfig.title}" added! Go to Dashboard Builder to see it.`, 'success');
            setShowAddToDashboard(false);
          }}
        />
      )}
    </div>
  );
}
