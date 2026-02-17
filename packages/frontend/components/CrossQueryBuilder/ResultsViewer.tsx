'use client';

import { useState } from 'react';
import { CrossQueryResult } from '@/types/cross-query';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, CheckCircle } from 'lucide-react';

interface ResultsViewerProps {
  result: CrossQueryResult;
}

export function ResultsViewer({ result }: ResultsViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  const totalPages = Math.ceil(result.rowCount / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, result.rowCount);
  const currentRows = result.rows.slice(startIndex, endIndex);

  const downloadCSV = () => {
    if (!result.rows || result.rows.length === 0) return;

    // Create CSV content
    const headers = result.fields.map((f) => f.name).join(',');
    const rows = result.rows
      .map((row) =>
        result.fields
          .map((f) => {
            const value = row[f.name];
            // Escape quotes and wrap in quotes if contains comma or quote
            if (value === null || value === undefined) return '';
            const strValue = String(value);
            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
              return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
          })
          .join(',')
      )
      .join('\n');

    const csv = `${headers}\n${rows}`;

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cross-query-results-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-semibold">Query Results</h2>
        </div>
        <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div>
          <strong>{result.rowCount}</strong> rows returned
        </div>
        <div>•</div>
        <div>
          Executed in <strong>{result.executionTimeMs}ms</strong>
        </div>
        <div>•</div>
        <div>
          <strong>{result.fields.length}</strong> columns
        </div>
      </div>

      {/* Results Table */}
      <div className="border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {result.fields.map((field) => (
                  <th
                    key={field.name}
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    <div>
                      <div>{field.name}</div>
                      <div className="text-xs font-normal">{field.type}</div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={result.fields.length}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No results found
                  </td>
                </tr>
              ) : (
                currentRows.map((row, rowIndex) => (
                  <tr
                    key={startIndex + rowIndex}
                    className="border-t hover:bg-muted/50"
                  >
                    {result.fields.map((field) => (
                      <td key={field.name} className="px-4 py-3">
                        {row[field.name] === null || row[field.name] === undefined ? (
                          <span className="text-muted-foreground italic">null</span>
                        ) : (
                          <span className="max-w-xs truncate block">
                            {String(row[field.name])}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {endIndex} of {result.rowCount} rows
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Generated SQL (collapsible) */}
      <details className="mt-4">
        <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
          View Generated SQL
        </summary>
        <div className="mt-2 bg-muted rounded-md p-4 overflow-x-auto">
          <pre className="text-xs font-mono whitespace-pre">{result.generatedSql}</pre>
        </div>
      </details>
    </div>
  );
}
