'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Download,
  FileText,
} from 'lucide-react';
import { api } from '@/lib/api';

export interface ImportJobStatus {
  id: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  totalRows?: number;
  errors?: Array<{
    row: number;
    column: string;
    value: any;
    error: string;
    type: string;
    severity: 'error' | 'warning';
    suggestion?: string;
  }>;
  createdAt: string;
  completedAt?: string;
}

interface ImportProgressProps {
  jobId: string;
  onComplete?: (job: ImportJobStatus) => void;
  onError?: (error: Error) => void;
}

export function ImportProgress({ jobId, onComplete, onError }: ImportProgressProps) {
  const [job, setJob] = useState<ImportJobStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedErrorType, setSelectedErrorType] = useState<string>('all');

  useEffect(() => {
    // Poll for job status
    const pollInterval = setInterval(async () => {
      try {
        const data = await api.ingestion.getJob(jobId);
        setJob(data);
        setLoading(false);

        // Stop polling if job is complete or failed
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollInterval);
          if (data.status === 'completed' && onComplete) {
            onComplete(data);
          }
          if (data.status === 'failed' && onError) {
            onError(new Error('Import job failed'));
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
        if (onError) onError(error as Error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [jobId, onComplete, onError]);

  if (loading || !job) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading import status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = job.totalRows
    ? Math.round((job.rowsProcessed / job.totalRows) * 100)
    : 0;

  const errorsByType = job.errors?.reduce((acc, error) => {
    acc[error.type] = (acc[error.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const errorTypes = errorsByType ? Object.keys(errorsByType) : [];

  const filteredErrors =
    selectedErrorType === 'all'
      ? job.errors || []
      : (job.errors || []).filter((e) => e.type === selectedErrorType);

  const handleExportErrors = () => {
    if (!job.errors || job.errors.length === 0) return;

    // Create CSV
    const headers = ['Row', 'Column', 'Value', 'Error', 'Type', 'Severity', 'Suggestion'];
    const rows = job.errors.map((e) => [
      e.row,
      e.column,
      JSON.stringify(e.value),
      e.error,
      e.type,
      e.severity,
      e.suggestion || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {job.status === 'processing' && (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              )}
              {job.status === 'completed' && (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              )}
              {job.status === 'failed' && (
                <AlertCircle className="h-6 w-6 text-red-600" />
              )}
              <div>
                <CardTitle>{job.fileName}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Import {job.status}
                </p>
              </div>
            </div>
            <Badge
              variant={
                job.status === 'completed'
                  ? 'default'
                  : job.status === 'failed'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {job.status.toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Progress */}
      {job.status === 'processing' && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {job.rowsProcessed.toLocaleString()} of{' '}
                  {job.totalRows?.toLocaleString() || '?'} rows processed
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Succeeded</p>
                <p className="text-2xl font-bold">{job.rowsSucceeded.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold">{job.rowsFailed.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold">{job.rowsProcessed.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Errors */}
      {job.errors && job.errors.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Import Errors ({job.errors.length})</CardTitle>
              <Button onClick={handleExportErrors} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedErrorType} onValueChange={setSelectedErrorType}>
              <TabsList>
                <TabsTrigger value="all">
                  All ({job.errors.length})
                </TabsTrigger>
                {errorTypes.map((type) => (
                  <TabsTrigger key={type} value={type}>
                    {type.replace(/_/g, ' ')} ({errorsByType![type]})
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value={selectedErrorType} className="mt-4">
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {filteredErrors.slice(0, 50).map((error, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-start gap-3">
                        {error.severity === 'error' ? (
                          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">Row {error.row}</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-muted-foreground">
                              Column: {error.column}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {error.type.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {error.error}
                          </p>
                          {error.value !== null && error.value !== undefined && (
                            <p className="text-xs text-muted-foreground">
                              Value: <code className="bg-muted px-1 py-0.5 rounded">
                                {JSON.stringify(error.value)}
                              </code>
                            </p>
                          )}
                          {error.suggestion && (
                            <p className="text-sm text-primary">
                              💡 {error.suggestion}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredErrors.length > 50 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Showing first 50 of {filteredErrors.length} errors. Export CSV to
                      see all.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
