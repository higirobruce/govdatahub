'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface PreviewData {
  rows: Record<string, any>[];
  schema: Array<{ name: string; type: string; sample: any }>;
  totalRows: number;
  errors?: Array<{
    row: number;
    column: string;
    value: any;
    error: string;
    type: string;
    severity: 'error' | 'warning';
    suggestion?: string;
  }>;
}

interface DataPreviewProps {
  data: PreviewData;
  loading?: boolean;
}

export function DataPreview({ data, loading }: DataPreviewProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Preview...</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const errorCount = data.errors?.filter((e) => e.severity === 'error').length || 0;
  const warningCount = data.errors?.filter((e) => e.severity === 'warning').length || 0;
  const validRows = data.totalRows - errorCount;
  const successRate = ((validRows / data.totalRows) * 100).toFixed(1);

  // Group errors by type
  const errorsByType = data.errors?.reduce((acc, error) => {
    acc[error.type] = (acc[error.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Data Quality Dashboard */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Info className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold">{data.totalRows.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valid Rows</p>
                <p className="text-2xl font-bold">{validRows.toLocaleString()}</p>
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
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-2xl font-bold">{errorCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/20">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Errors Summary */}
      {data.errors && data.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Quality Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {errorsByType &&
                Object.entries(errorsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{type.replace(/_/g, ' ')}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {count} occurrence{count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <Alert className="mt-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Preview showing first {Math.min(5, data.errors.length)} of {data.errors.length}{' '}
                total issues. These rows will be logged but skipped during import.
              </AlertDescription>
            </Alert>

            <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
              {data.errors.slice(0, 5).map((error, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg border bg-card text-sm"
                >
                  <div className="flex items-start gap-2">
                    {error.severity === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className="font-medium">
                        Row {error.row}, Column: {error.column}
                      </p>
                      <p className="text-muted-foreground">{error.error}</p>
                      {error.suggestion && (
                        <p className="text-xs text-muted-foreground italic">
                          💡 {error.suggestion}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Preview Table */}
      <Card>
        <CardHeader>
          <CardTitle>Data Preview (First 100 Rows)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  {data.schema.map((col) => (
                    <TableHead key={col.name}>
                      <div>
                        <div className="font-semibold">{col.name}</div>
                        <div className="text-xs text-muted-foreground font-normal">
                          {col.type}
                        </div>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.slice(0, 100).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    {data.schema.map((col) => (
                      <TableCell key={col.name}>
                        {row[col.name]?.toString() || (
                          <span className="text-muted-foreground italic">null</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
