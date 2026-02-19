'use client';

import { useState } from 'react';
import { CrossQueryResult } from '@/types';

interface ResultsViewerProps {
  result: CrossQueryResult;
}

export function ResultsViewer({ result }: ResultsViewerProps) {
  const [currentPage, setCurrentPage] = useState(0);
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Query Results</h3>
        <div className="text-sm text-gray-600">
          {result.rowCount} rows in {result.executionTimeMs}ms
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
    </div>
  );
}
