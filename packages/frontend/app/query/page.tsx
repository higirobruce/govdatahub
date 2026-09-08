'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Connection, QueryResult } from '@/types';
import SQLEditor from '@/components/QueryInterface/SQLEditor';
import ResultsTable from '@/components/QueryInterface/ResultsTable';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Play, AlertCircle, BarChart3, LayoutDashboard, Search, Sparkles, Code, Download, Database, FileText, ChevronDown } from 'lucide-react';
import { QueryVisualization } from '@/components/QueryVisualization';
import { AddToDashboardModal } from '@/components/DashboardBuilder/AddToDashboardModal';
import { useToast } from '@/components/ui/toast';
import { OrganizationSettings } from '@/types/settings';
import { exportQueryResultsToCsv, exportQueryResultsToJson, exportQueryResultsToExcel } from '@/lib/export-utils';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';

type DataSource = 'connections' | 'staging';
type EditorMode = 'sql' | 'nl';

const MONGO_DEFAULT = '{\n  "collection": "",\n  "filter": {},\n  "limit": 100\n}';
const SQL_DEFAULT = 'SELECT * FROM ';

interface StagingTable {
  name: string;
  schema: string;
  rowCount: number | null;
  sizeBytes: number;
}

export default function QueryPage() {
  const { showToast } = useToast();
  // Relies on this page rendering dynamically (no static prerender) — if the
  // build ever forces static generation for this route again, this call needs
  // a Suspense boundary per Next's useSearchParams() prerendering rules.
  const searchParams = useSearchParams();
  const [dataSource, setDataSource] = useState<DataSource>('connections');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [selectedStagingTable, setSelectedStagingTable] = useState<string>('');
  const [sql, setSql] = useState(SQL_DEFAULT);
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

  // Sidebar state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['data-sources'])
  );

  const { data: connections } = useSWR<Connection[]>('/connections', () =>
    api.connections.list()
  );

  const { data: stagingTables } = useSWR<StagingTable[]>(
    dataSource === 'staging' ? '/schema/staging/tables' : null,
    () => api.schema.getStagingTables()
  );

  // Fetch organization settings for NL2SQL
  const { data: settings } = useSWR<OrganizationSettings>('/settings', () => api.settings.get());

  const toggleSection = (section: string) => {
    const newSet = new Set(expandedSections);
    if (newSet.has(section)) {
      newSet.delete(section);
    } else {
      newSet.add(section);
    }
    setExpandedSections(newSet);
  };

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
      if (schema) {
        setSql(`SELECT * FROM ${schema}."${table}" LIMIT 100;`);
      } else {
        setSql(`SELECT * FROM ${table} LIMIT 100;`);
      }
    }
  }, [searchParams]);

  const selectedConnection = connections?.find((c) => c.id === selectedConnectionId) ?? null;
  const isMongoDB = selectedConnection?.type === 'mongodb';

  // Track previous connection type to reset query only when switching between mongo/sql
  const prevConnectionTypeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedConnectionId || !selectedConnection) return;
    const prevType = prevConnectionTypeRef.current;
    const currentType = selectedConnection.type;
    prevConnectionTypeRef.current = currentType;
    const wasMongoDb = prevType === 'mongodb';
    const isNowMongoDb = currentType === 'mongodb';
    if (prevType === null) {
      // First connection load — if MongoDB, override any placeholder SQL default
      if (isNowMongoDb) {
        setSql(MONGO_DEFAULT);
        setQueryResult(null);
        setError(null);
      }
    } else if (wasMongoDb !== isNowMongoDb) {
      // Switching between MongoDB and SQL — reset to appropriate default
      setSql(isNowMongoDb ? MONGO_DEFAULT : SQL_DEFAULT);
      setQueryResult(null);
      setError(null);
    }
  }, [selectedConnectionId, selectedConnection]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleExecute = async () => {
    if (dataSource === 'connections' && !selectedConnectionId) {
      setError('Please select a database connection');
      return;
    }
    if (dataSource === 'staging' && !selectedStagingTable) {
      setError('Please select a staging table');
      return;
    }
    if (!sql.trim()) {
      setError('Please enter a query');
      return;
    }

    setIsExecuting(true);
    setError(null);
    setQueryResult(null);

    try {
      if (dataSource === 'connections') {
        const result = await api.queries.execute({
          connectionId: selectedConnectionId,
          sql: sql.trim(),
          cacheResults: false,
        });
        setQueryResult(result);
        showToast(
          `Query executed successfully: ${result.rowCount} rows returned in ${result.executionTimeMs}ms`,
          'success'
        );
      } else {
        const result = await api.queries.executeStaging(sql.trim());
        setQueryResult(result);
        showToast(
          `Query executed successfully: ${result.rowCount} rows returned in ${result.executionTimeMs}ms`,
          'success'
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute query');
      showToast(
        `Query failed: ${err.message || 'An error occurred'}`,
        'error'
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const handleGenerateSql = async () => {
    if (!nlQuery.trim()) {
      setError('Please enter a natural language query');
      return;
    }

    setIsGeneratingSql(true);
    setError(null);
    setAiReasoning(null);
    setSqlWarnings([]);

    try {
      const connectionIds = dataSource === 'connections' && selectedConnectionId
        ? [selectedConnectionId]
        : undefined;

      const result = await api.nl2sql.generateSql({
        query: nlQuery,
        connectionIds,
        autoExecute: settings?.nl2sqlAutoExecute || false,
      });

      setSql(result.sql);
      if (result.reasoning) {
        setAiReasoning(result.reasoning);
      }
      if (result.warnings && result.warnings.length > 0) {
        setSqlWarnings(result.warnings);
      }

      // If auto-execute is enabled and we got results
      if (settings?.nl2sqlAutoExecute && result.queryResult) {
        setQueryResult(result.queryResult);
      }

      showToast(
        'SQL generated successfully - Review and execute when ready',
        'success'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to generate SQL');
      showToast(
        `SQL generation failed: ${err.message || 'An error occurred'}`,
        'error'
      );
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleStagingTableChange = (value: string) => {
    setSelectedStagingTable(value);
    if (value) {
      const [schema, tableName] = value.split('.');
      setSql(`SELECT * FROM ${schema}."${tableName}" LIMIT 100;`);
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
    <div className="w-full h-screen flex flex-col bg-[#f2f2f2] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6">
        <PageHeader
          title="Query"
          subtitle="Query your databases and staging data"
          icon={Search}
          className="mb-0"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden w-full max-w-full min-h-0 px-6 pb-6 pt-4">
        {/* Left Sidebar */}
        <div className="bg-white border border-[#e8e8e8] rounded-l-xl flex flex-col overflow-hidden flex-shrink-0 w-[280px] shadow-sm">
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* DATA SOURCES Section */}
            <div className="border-b border-[#f0f0f0]">
              <button
                onClick={() => toggleSection('data-sources')}
                className="w-full px-4 py-3 bg-[#fafafa] hover:bg-[#f5f5f5] transition-colors flex items-center justify-between"
              >
                <span className="text-xs font-bold text-[#1a1a1a] tracking-wide">DATA SOURCES</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#555555] transition-transform ${
                    expandedSections.has('data-sources') ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {expandedSections.has('data-sources') && (
                <div className="p-4 space-y-3">
                  {/* Connection/Staging Toggle */}
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setDataSource('connections');
                        setSelectedStagingTable('');
                        setError(null);
                      }}
                      className={`w-full px-3 py-2 text-sm rounded-md transition-colors text-left flex items-center gap-2 ${
                        dataSource === 'connections'
                          ? 'bg-[#1a1a1a] text-white'
                          : 'bg-[#f5f5f5] text-[#555555] hover:bg-[#eeeeee]'
                      }`}
                    >
                      <Database className="w-4 h-4" />
                      Connections
                    </button>
                    <button
                      onClick={() => {
                        setDataSource('staging');
                        setSelectedConnectionId('');
                        setError(null);
                      }}
                      className={`w-full px-3 py-2 text-sm rounded-md transition-colors text-left flex items-center gap-2 ${
                        dataSource === 'staging'
                          ? 'bg-[#1a1a1a] text-white'
                          : 'bg-[#f5f5f5] text-[#555555] hover:bg-[#eeeeee]'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      Staging Data
                    </button>
                  </div>

                  {/* Selection Dropdown */}
                  {dataSource === 'connections' ? (
                    <div>
                      <label className="block text-xs font-medium text-[#777777] mb-2">
                        Select Connection
                      </label>
                      <select
                        value={selectedConnectionId}
                        onChange={(e) => setSelectedConnectionId(e.target.value)}
                        className="block w-full rounded-md border border-[#e0e0e0] px-2 py-1.5 text-xs focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none bg-white"
                      >
                        <option value="">-- Select --</option>
                        {connections?.map((conn) => (
                          <option key={conn.id} value={conn.id}>
                            {conn.name}
                          </option>
                        ))}
                      </select>
                      {(!connections || connections.length === 0) && (
                        <p className="mt-2 text-xs text-[#aaaaaa]">
                          <a href="/connections" className="text-[#1a1a1a] hover:underline font-medium">
                            Create connection →
                          </a>
                        </p>
                      )}
                      {selectedConnectionId && connections && (
                        <div className="mt-2 text-xs text-[#777777]">
                          {connections.find(c => c.id === selectedConnectionId)?.type} • {connections.find(c => c.id === selectedConnectionId)?.database}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-[#777777] mb-2">
                        Select Table
                      </label>
                      <select
                        value={selectedStagingTable}
                        onChange={(e) => handleStagingTableChange(e.target.value)}
                        className="block w-full rounded-md border border-[#e0e0e0] px-2 py-1.5 text-xs focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none bg-white"
                      >
                        <option value="">-- Select --</option>
                        {stagingTables?.map((table) => (
                          <option key={`${table.schema}.${table.name}`} value={`${table.schema}.${table.name}`}>
                            {table.name}
                          </option>
                        ))}
                      </select>
                      {(!stagingTables || stagingTables.length === 0) && (
                        <p className="mt-2 text-xs text-[#aaaaaa]">
                          <a href="/ingestion" className="text-[#1a1a1a] hover:underline font-medium">
                            Upload data →
                          </a>
                        </p>
                      )}
                      {selectedStagingTable && stagingTables && (
                        <div className="mt-2 text-xs text-[#777777]">
                          {stagingTables.find(t => `${t.schema}.${t.name}` === selectedStagingTable)?.rowCount?.toLocaleString() || 0} rows
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white border-r border-t border-b border-[#e8e8e8] rounded-r-xl shadow-sm">
          {/* Editor Mode Tabs */}
          <div className="border-b border-[#f0f0f0] bg-[#fafafa]">
            <nav className="flex px-6" aria-label="Editor Mode">
              <button
                onClick={() => setEditorMode('sql')}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  editorMode === 'sql'
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#555555] hover:text-[#1a1a1a]'
                }`}
              >
                <Code className="w-4 h-4" />
                Query Editor
              </button>
              <button
                onClick={() => setEditorMode('nl')}
                disabled={!settings?.nl2sqlEnabled}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  editorMode === 'nl'
                    ? 'border-[#1a1a1a] text-[#1a1a1a]'
                    : 'border-transparent text-[#555555] hover:text-[#1a1a1a]'
                } ${!settings?.nl2sqlEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={!settings?.nl2sqlEnabled ? 'Enable in Settings' : ''}
              >
                <Sparkles className="w-4 h-4" />
                Natural Language
              </button>
            </nav>
          </div>

          {/* Editor Content with Toolbar */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#f0f0f0] bg-[#fafafa] flex-shrink-0">
              <div className="flex items-center gap-3">
                {editorMode === 'sql' ? (
                  <>
                    <span className="text-xs text-[#777777] font-mono">
                      Press <kbd className="px-1.5 py-0.5 bg-white border border-[#e0e0e0] rounded text-[10px] font-semibold">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 bg-white border border-[#e0e0e0] rounded text-[10px] font-semibold">Enter</kbd> to execute
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-[#777777]">Describe your query in plain English</span>
                )}
              </div>
              <Button
                onClick={editorMode === 'sql' ? handleExecute : handleGenerateSql}
                disabled={
                  (editorMode === 'sql' ? isExecuting : isGeneratingSql) ||
                  (dataSource === 'connections' && !selectedConnectionId) ||
                  (dataSource === 'staging' && !selectedStagingTable)
                }
                className="gap-2"
              >
                {(editorMode === 'sql' ? isExecuting : isGeneratingSql) ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {editorMode === 'sql' ? 'Executing...' : 'Generating...'}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {editorMode === 'sql' ? 'Run Query' : 'Generate SQL'}
                  </>
                )}
              </Button>
            </div>

            {/* Editor */}
            <div className="flex-shrink-0 p-6 border-b border-[#f0f0f0]">
              {editorMode === 'sql' ? (
                <>
                  <SQLEditor
                    value={sql}
                    onChange={setSql}
                    onKeyDown={handleKeyDown}
                    disabled={isExecuting}
                    height="220px"
                    theme="dark"
                    language={isMongoDB ? 'json' : 'sql'}
                  />
                  <div className="mt-4 flex items-start gap-2 bg-[#f0f9ff] border border-[#bae6fd] rounded-lg px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-[#0284c7] flex-shrink-0 mt-0.5" />
                    {isMongoDB ? (
                      <p className="text-xs text-[#0284c7]">
                        <span className="font-semibold">MongoDB:</span> Enter a JSON find query{' '}
                        <code className="font-mono">{'{"collection":"...","filter":{},"limit":100}'}</code>{' '}
                        or aggregate <code className="font-mono">{'{"collection":"...","pipeline":[{"$match":{}}]}'}</code>
                      </p>
                    ) : (
                      <p className="text-xs text-[#0284c7]">
                        <span className="font-semibold">Tip:</span> PostgreSQL lowercases unquoted column names. Use double quotes for mixed case columns.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Textarea
                    value={nlQuery}
                    onChange={(e) => setNlQuery(e.target.value)}
                    placeholder="Example: Show me the top 10 customers by revenue in the last month"
                    className="min-h-[120px] font-normal"
                    disabled={isGeneratingSql}
                  />
                  {aiReasoning && (
                    <div className="mt-4 bg-[#f0fdf4] border border-[#86efac] rounded-lg p-4">
                      <p className="text-xs font-semibold text-[#166534] mb-2">AI Reasoning:</p>
                      <p className="text-xs text-[#166534]">{aiReasoning}</p>
                    </div>
                  )}
                  {sqlWarnings.length > 0 && (
                    <div className="mt-4 bg-[#fef3c7] border border-[#fde047] rounded-lg p-3">
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

            {/* Results / Error area — fills remaining space */}
            <div className="flex-1 overflow-auto min-h-0">
            {/* Error Display */}
            {error && (
              <div className="mx-6 mt-4 mb-2 bg-[#fee2e2] border border-[#fca5a5] rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-[#ef4444] flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium text-[#991b1b]">Error</h3>
                    <p className="mt-1 text-sm text-[#991b1b]">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Results */}
            {queryResult && (
              <div className="min-w-0">
                <div className="px-6 py-4 min-w-0">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-semibold text-[#1a1a1a]">
                      Query Results
                    </h3>
                    <div className="flex items-center gap-3">
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
                      <div className="text-xs text-[#aaaaaa]">
                        {queryResult.rowCount} rows in {queryResult.executionTimeMs}ms
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <ResultsTable result={queryResult} />
                  </div>
                </div>
              </div>
            )}
            </div>{/* end results/error flex-1 wrapper */}
          </div>
        </div>
      </div>

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
          onAdd={() => setShowAddToDashboard(false)}
        />
      )}
    </div>
  );
}
