'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import useSWR from 'swr';
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
} from 'lucide-react';

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
  const [selectedTransformation, setSelectedTransformation] = useState<Transformation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRunsModal, setShowRunsModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [selectedRuns, setSelectedRuns] = useState<TransformationRun[]>([]);
  const [selectedResults, setSelectedResults] = useState<any>(null);
  const [resultsPage, setResultsPage] = useState(0);
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
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
      alert('Transformation executed successfully!');
      mutate(); // Refresh list to update lastRunAt
    } catch (error: any) {
      alert(`Execution failed: ${error.message}`);
    } finally {
      setIsExecuting(null);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.transformations.pause(id);
      mutate();
    } catch (error: any) {
      alert(`Failed to pause: ${error.message}`);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await api.transformations.resume(id);
      mutate();
    } catch (error: any) {
      alert(`Failed to resume: ${error.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transformation? This will also delete all execution history.')) {
      return;
    }
    try {
      await api.transformations.delete(id);
      mutate();
    } catch (error: any) {
      alert(`Failed to delete: ${error.message}`);
    }
  };

  const handleViewRuns = async (transformation: Transformation) => {
    try {
      const runs = (await api.transformations.getRuns(transformation.id, 20, 0)) as TransformationRun[];
      setSelectedRuns(runs);
      setSelectedTransformation(transformation);
      setShowRunsModal(true);
    } catch (error: any) {
      alert(`Failed to load runs: ${error.message}`);
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
      active: 'bg-green-100 text-green-800',
      paused: 'bg-gray-100 text-gray-800',
      running: 'bg-blue-100 text-blue-800',
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      timeout: 'bg-orange-100 text-orange-800',
    };
    return (
      <Badge className={variants[status] || ''}>{status}</Badge>
    );
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Failed to load transformations: {error.message}</p>
          <p className="text-red-600 text-sm mt-2">Please check the browser console for more details.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-4 text-gray-600">Loading transformations...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show create form
  if (showCreateModal) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button
          variant="outline"
          onClick={() => setShowCreateModal(false)}
          className="mb-4"
        >
          <X className="h-4 w-4 mr-2" />
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
      <div className="container mx-auto px-4 py-8 max-w-7xl">
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
          <X className="h-4 w-4 mr-2" />
          Back to Runs
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Transformation Results</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
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
                  <span className="text-sm text-gray-600">
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
              <div className="text-center py-12 text-gray-500">
                No results returned
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {selectedResults.fields?.map((field: any) => (
                        <th
                          key={field.name}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {field.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedRows.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        {selectedResults.fields?.map((field: any) => (
                          <td
                            key={field.name}
                            className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                          >
                            {row[field.name] === null
                              ? <span className="text-gray-400">NULL</span>
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
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Button
          variant="outline"
          onClick={() => setShowRunsModal(false)}
          className="mb-4"
        >
          <X className="h-4 w-4 mr-2" />
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
                <p className="text-gray-500">No execution history yet</p>
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
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                        {(run.status === 'failed' || run.status === 'timeout') && (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div className="text-sm space-y-1">
                        <p className="text-gray-600">
                          Started: {formatDate(run.startedAt)}
                        </p>
                        {run.completedAt && (
                          <p className="text-gray-600">
                            Duration: {formatDuration(run.executionTimeMs)}
                          </p>
                        )}
                        {run.rowsProcessed !== null && (
                          <p className="text-gray-600">
                            Rows: {run.rowsProcessed.toLocaleString()}
                          </p>
                        )}
                        {run.errorMessage && (
                          <p className="text-red-600 text-xs">
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
                            alert(`Failed to load results: ${error.message}`);
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
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transformations</h1>
          <p className="mt-2 text-gray-600">
            Manage SQL-based data transformations
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Transformation
        </Button>
      </div>

      {/* Transformations List */}
      {!transformations || transformations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">
              No transformations created yet
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
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
                    <p className="text-sm text-gray-500 mt-1">
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
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="bg-gray-50 p-3 rounded-md font-mono text-xs overflow-x-auto">
                    {transformation.sqlQuery}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceConnectionId, setSourceConnectionId] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [maxRows, setMaxRows] = useState(10000);
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          rows={2}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Source Connection *
        </label>
        <select
          value={sourceConnectionId}
          onChange={(e) => setSourceConnectionId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          SQL Query *
        </label>
        <textarea
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
          rows={8}
          placeholder="SELECT user_id, COUNT(*) as count FROM events GROUP BY user_id"
          required
        />
        <p className="text-xs text-gray-500 mt-1">
          Write a SELECT query to transform your data
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Max Rows
        </label>
        <input
          type="number"
          value={maxRows}
          onChange={(e) => setMaxRows(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          min="1"
          max="100000"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm">{error}</p>
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
