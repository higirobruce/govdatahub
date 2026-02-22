'use client';

import { useState } from 'react';
import { CrossQueryResult, QueryResult } from '@/types';
import { Button } from '@/components/ui/button';
import { BarChart3, LayoutDashboard, Download } from 'lucide-react';
import { QueryVisualization } from '@/components/QueryVisualization';
import { AddToDashboardModal } from '@/components/DashboardBuilder/AddToDashboardModal';
import { useToast } from '@/components/ui/toast';

interface ResultsViewerProps {
  result: CrossQueryResult;
}

export function ResultsViewer({ result }: ResultsViewerProps) {
  const { showToast } = useToast();
  const [currentPage, setCurrentPage] = useState(0);
  const [showVisualization, setShowVisualization] = useState(false);
  const [showAddToDashboard, setShowAddToDashboard] = useState(false);
  const rowsPerPage = 100;

  if (!result.rows || result.rows.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Query executed successfully but returned no rows.
      </div>
    );
  }

  const totalPages = Math.ceil(result.rows.length / rowsPerPage);
  const startIdx = currentPage * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, result.rows.length);
  const currentRows = result.rows.slice(startIdx, endIdx);

  const columns = result.fields.map((f) => f.name);

  // Convert CrossQueryResult to QueryResult format for compatibility
  const queryResult: QueryResult = {
    fields: result.fields,
    rows: result.rows,
    rowCount: result.rowCount,
    executionTimeMs: result.executionTimeMs,
  };

  const handleExportCSV = () => {
    const csv = [
      columns.join(','),
      ...result.rows.map(row =>
        columns.map(col => {
          const value = row[col];
          if (value === null) return '';
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cross-query-results-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Results exported to CSV', 'success');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Query Results</h3>
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
          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <div className="text-sm text-gray-600">
            {result.rowCount} rows in {result.executionTimeMs}ms
          </div>
        </div>
      </div>

      {/* Pagination Info */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm text-gray-700">
          <span>
            Showing {startIdx + 1} to {endIdx} of {result.rows.length} rows
          </span>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="px-3 py-1">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={currentPage === totalPages - 1}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50">
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap"
                  >
                    {row[col] === null ? (
                      <span className="text-gray-400 italic">NULL</span>
                    ) : typeof row[col] === 'object' ? (
                      <span className="text-xs font-mono">
                        {JSON.stringify(row[col])}
                      </span>
                    ) : (
                      String(row[col])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Generated SQL */}
      {result.generatedSql && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
            View Generated SQL
          </summary>
          <pre className="mt-2 text-xs font-mono bg-gray-900 text-gray-100 p-3 rounded-md overflow-x-auto">
            {result.generatedSql}
          </pre>
        </details>
      )}

      {/* Visualization Modal */}
      {showVisualization && (
        <QueryVisualization
          queryResult={queryResult}
          onClose={() => setShowVisualization(false)}
        />
      )}

      {/* Add to Dashboard Modal */}
      {showAddToDashboard && (
        <AddToDashboardModal
          queryResult={queryResult}
          onClose={() => setShowAddToDashboard(false)}
          onAdd={(chartConfig) => {
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
