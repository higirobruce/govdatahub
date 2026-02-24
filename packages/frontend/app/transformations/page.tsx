'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import useSWR from 'swr';
import SQLEditor from '@/components/QueryInterface/SQLEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Trash2,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  GitBranch,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Transformation {
  id: string;
  name: string;
  description: string;
  sourceConnectionId: string;
  sqlQuery: string;
  outputConfig: {
    mode: 'cache';
    maxRows?: number;
  };
  status: 'active' | 'paused';
  createdAt: string;
  lastRunAt: string | null;
}

interface TransformationRun {
  id: string;
  transformationId: string;
  transformationName?: string;
  triggerType: 'manual' | 'scheduled';
  startedAt: string;
  completedAt: string | null;
  executionTimeMs: number | null;
  rowsProcessed: number | null;
  status: 'running' | 'success' | 'failed' | 'timeout';
  errorMessage: string | null;
}

interface Connection {
  id: string;
  name: string;
  type: string;
}

export default function TransformationsPage() {
  const { showToast } = useToast();
  const [selectedTransformation, setSelectedTransformation] = useState<Transformation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRunsModal, setShowRunsModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedRuns, setSelectedRuns] = useState<TransformationRun[]>([]);
  const [selectedResults, setSelectedResults] = useState<any>(null);
  const [resultsPage, setResultsPage] = useState(0);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });
  const RESULTS_PER_PAGE = 50;

  // Fetch transformations
  const {
    data: transformations,
    mutate,
    error,
    isLoading,
  } = useSWR<Transformation[]>(
    '/transformations',
    async () => {
      const result = await api.transformations.list();
      return result as Transformation[];
    }
  );

  // Fetch connections for the create form
  const { data: connections } = useSWR<Connection[]>(
    '/connections',
    async () => {
      const result = await api.connections.list();
      return result as Connection[];
    }
  );

  const handleExecute = async (id: string) => {
    setIsExecuting(id);
    try {
      await api.transformations.execute(id);
      showToast('Transformation executed successfully!', 'success');
      mutate(); // Refresh list to update lastRunAt
    } catch (error: any) {
      showToast(`Execution failed: ${error.message}`, 'error');
    } finally {
      setIsExecuting(null);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.transformations.pause(id);
      mutate();
    } catch (error: any) {
      showToast(`Failed to pause: ${error.message}`, 'error');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await api.transformations.resume(id);
      mutate();
    } catch (error: any) {
      showToast(`Failed to resume: ${error.message}`, 'error');
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await api.transformations.delete(deleteConfirm.id);
      mutate();
      showToast('Transformation deleted successfully', 'success');
    } catch (error: any) {
      showToast(`Failed to delete: ${error.message}`, 'error');
    }
  };

  const handleViewRuns = async (transformation: Transformation) => {
    try {
      const runs = (await api.transformations.getRuns(transformation.id, 20, 0)) as TransformationRun[];
      setSelectedRuns(runs);
      setSelectedTransformation(transformation);
      setShowRunsModal(true);
    } catch (error: any) {
      showToast(`Failed to load runs: ${error.message}`, 'error');
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      active: 'bg-[#d1fae5] text-[#065f46]',
      paused: 'bg-[#f0f0f0] text-[#555555]',
      running: 'bg-[#dbeafe] text-[#1e40af]',
      success: 'bg-[#d1fae5] text-[#065f46]',
      failed: 'bg-[#fee2e2] text-[#991b1b]',
      timeout: 'bg-[#fed7aa] text-[#9a3412]',
    };
    return (
      <Badge className={variants[status] || ''}>{status}</Badge>
    );
  };

  if (error) {
    return (
      <div className="w-full">
        <div className="bg-[#fee2e2] border border-[#fca5a5] rounded-md p-4">
          <p className="text-[#991b1b]">Failed to load transformations: {error.message}</p>
          <p className="text-[#991b1b] text-sm mt-2">Please check the browser console for more details.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a1a1a]"></div>
            <p className="mt-4 text-[#555555]">Loading transformations...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show create form
  if (showCreateModal) {
    return (
      <div className="w-full max-w-3xl">
        <Button
          variant="outline"
          onClick={() => setShowCreateModal(false)}
          className="mb-4"
        >
          <X className="h-4 w-4" />
          Cancel
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Create Transformation</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateTransformationForm
              connections={connections || []}
              onSuccess={() => {
                setShowCreateModal(false);
                mutate();
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show results viewer
  if (showResultsModal && selectedResults) {
    const totalRows = selectedResults.rows?.length || 0;
    const totalPages = Math.ceil(totalRows / RESULTS_PER_PAGE);
    const startIdx = resultsPage * RESULTS_PER_PAGE;
    const endIdx = Math.min(startIdx + RESULTS_PER_PAGE, totalRows);
    const paginatedRows = selectedResults.rows?.slice(startIdx, endIdx) || [];

    return (
      <div className="w-full max-w-7xl">
        <Button
          variant="outline"
          onClick={() => {
            setShowResultsModal(false);
            setSelectedResults(null);
            setResultsPage(0);
            // Return to runs modal
            setShowRunsModal(true);
          }}
          className="mb-4"
        >
          <X className="h-4 w-4" />
          Back to Runs
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transformation Results</CardTitle>
                <p className="text-sm text-[#555555] mt-1">
                  {totalRows} total rows {totalRows > RESULTS_PER_PAGE && `(showing ${startIdx + 1}-${endIdx})`}
                </p>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResultsPage(Math.max(0, resultsPage - 1))}
                    disabled={resultsPage === 0}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-[#555555]">
                    Page {resultsPage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResultsPage(Math.min(totalPages - 1, resultsPage + 1))}
                    disabled={resultsPage >= totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {totalRows === 0 ? (
              <div className="text-center py-12 text-[#aaaaaa]">
                No results returned
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#f0f0f0]">
                  <thead className="bg-[#f8f8f8]">
                    <tr>
                      {selectedResults.fields?.map((field: any) => (
                        <th
                          key={field.name}
                          className="px-6 py-3 text-left text-xs font-medium text-[#aaaaaa] uppercase tracking-wider"
                        >
                          {field.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-[#f0f0f0]">
                    {paginatedRows.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-[#fafafa]">
                        {selectedResults.fields?.map((field: any) => (
                          <td
                            key={field.name}
                            className="px-6 py-4 whitespace-nowrap text-sm text-[#1a1a1a]"
                          >
                            {row[field.name] === null
                              ? <span className="text-[#aaaaaa]">NULL</span>
                              : typeof row[field.name] === 'object'
                              ? JSON.stringify(row[field.name])
                              : String(row[field.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show runs modal
  if (showRunsModal && selectedTransformation) {
    return (
      <div className="w-full max-w-5xl">
        <Button
          variant="outline"
          onClick={() => setShowRunsModal(false)}
          className="mb-4"
        >
          <X className="h-4 w-4" />
          Back to List
        </Button>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Execution History: {selectedTransformation.name}</CardTitle>
          </CardHeader>
        </Card>
        <div className="space-y-3">
          {selectedRuns.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-[#aaaaaa]">No execution history yet</p>
              </CardContent>
            </Card>
          ) : (
            selectedRuns.map((run) => (
              <Card key={run.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(run.status)}
                        {run.status === 'running' && (
                          <Clock className="h-4 w-4 animate-spin" />
                        )}
                        {run.status === 'success' && (
                          <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
                        )}
                        {(run.status === 'failed' || run.status === 'timeout') && (
                          <XCircle className="h-4 w-4 text-[#dc2626]" />
                        )}
                      </div>
                      <div className="text-sm space-y-1">
                        <p className="text-[#555555]">
                          Started: {formatDate(run.startedAt)}
                        </p>
                        {run.completedAt && (
                          <p className="text-[#555555]">
                            Duration: {formatDuration(run.executionTimeMs)}
                          </p>
                        )}
                        {run.rowsProcessed !== null && (
                          <p className="text-[#555555]">
                            Rows: {run.rowsProcessed.toLocaleString()}
                          </p>
                        )}
                        {run.errorMessage && (
                          <p className="text-[#dc2626] text-xs">
                            Error: {run.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                    {run.status === 'success' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const results = await api.transformations.getRunResults(run.id);
                            setSelectedResults(results);
                            setResultsPage(0);
                            setShowRunsModal(false);
                            setShowResultsModal(true);
                          } catch (error: any) {
                            showToast(`Failed to load results: ${error.message}`, 'error');
                          }
                        }}
                      >
                        View Results
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="w-full">
      <PageHeader
        title="Transformations"
        subtitle="Manage SQL-based data transformations"
        icon={GitBranch}
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            Create Transformation
          </Button>
        }
      />

      {/* Transformations List */}
      {!transformations || transformations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-[#aaaaaa] mb-4">
              No transformations created yet
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Create Your First Transformation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {transformations.map((transformation) => (
            <Card key={transformation.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{transformation.name}</CardTitle>
                      {getStatusBadge(transformation.status)}
                    </div>
                    <p className="text-sm text-[#aaaaaa] mt-1">
                      {transformation.description}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewRuns(transformation)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {transformation.status === 'active' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExecute(transformation.id)}
                          disabled={isExecuting === transformation.id}
                        >
                          {isExecuting === transformation.id ? (
                            'Executing...'
                          ) : (
                            <>
                              <Play className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePause(transformation.id)}
                        >
                          <Pause className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResume(transformation.id)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(transformation.id)}
                    >
                      <Trash2 className="h-4 w-4 text-[#dc2626]" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="bg-[#f8f8f8] p-3 rounded-md font-mono text-xs overflow-x-auto">
                    {transformation.sqlQuery}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-[#555555]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Last run: {formatDate(transformation.lastRunAt)}
                    </span>
                    <span>
                      Max rows: {transformation.outputConfig.maxRows || 10000}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null })}
        onConfirm={confirmDelete}
        title="Delete Transformation"
        message="Are you sure you want to delete this transformation? This will also delete all execution history. This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

// Create Transformation Form Component
function CreateTransformationForm({
  connections,
  onSuccess,
}: {
  connections: Connection[];
  onSuccess: () => void;
}) {
  const MONGO_DEFAULT = '{\n  "collection": "",\n  "filter": {},\n  "limit": 10000\n}';
  const SQL_DEFAULT = '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceConnectionId, setSourceConnectionId] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [maxRows, setMaxRows] = useState(10000);

  const selectedConn = connections.find((c) => c.id === sourceConnectionId);
  const isMongoDB = selectedConn?.type === 'mongodb';

  const handleConnectionChange = (id: string) => {
    const prev = connections.find((c) => c.id === sourceConnectionId);
    const next = connections.find((c) => c.id === id);
    setSourceConnectionId(id);
    // Reset query when switching between MongoDB and SQL modes
    if (prev?.type !== next?.type) {
      setSqlQuery(next?.type === 'mongodb' ? MONGO_DEFAULT : SQL_DEFAULT);
    }
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await api.transformations.create({
        name,
        description,
        sourceConnectionId,
        sqlQuery,
        outputConfig: {
          mode: 'cache',
          maxRows,
        },
      });
      onSuccess();
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[#555555] mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-[#dddddd] rounded-md text-[13px] focus:outline-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a]"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#555555] mb-1">
          Description *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-[#dddddd] rounded-md text-[13px] focus:outline-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a]"
          rows={2}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#555555] mb-1">
          Source Connection *
        </label>
        <select
          value={sourceConnectionId}
          onChange={(e) => handleConnectionChange(e.target.value)}
          className="w-full px-3 py-2 border border-[#dddddd] rounded-md text-[13px] focus:outline-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a]"
          required
        >
          <option value="">Select a connection</option>
          {connections.map((conn) => (
            <option key={conn.id} value={conn.id}>
              {conn.name} ({conn.type})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#555555] mb-1">
          {isMongoDB ? 'Query (MongoDB JSON) *' : 'SQL Query *'}
        </label>
        <SQLEditor
          value={sqlQuery}
          onChange={setSqlQuery}
          height="200px"
          theme="dark"
          language={isMongoDB ? 'json' : 'sql'}
        />
        <p className="text-xs text-[#aaaaaa] mt-1">
          {isMongoDB
            ? 'Enter a MongoDB JSON query. Format: {"collection":"...","filter":{},"limit":10000}'
            : 'Write a SELECT query to transform your data'}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#555555] mb-1">
          Max Rows
        </label>
        <input
          type="number"
          value={maxRows}
          onChange={(e) => setMaxRows(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-[#dddddd] rounded-md text-[13px] focus:outline-none focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a]"
          min="1"
          max="100000"
        />
      </div>

      {error && (
        <div className="bg-[#fee2e2] border border-[#fca5a5] rounded-md p-3">
          <p className="text-[#991b1b] text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Transformation'}
        </Button>
      </div>
    </form>
  );
}
