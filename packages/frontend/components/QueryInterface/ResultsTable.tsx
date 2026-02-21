'use client';

import { useState } from 'react';
import { QueryResult } from '@/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ResultsTableProps {
  result: QueryResult;
}

export default function ResultsTable({ result }: ResultsTableProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const rowsPerPage = 100;

  if (!result.rows || result.rows.length === 0) {
    return (
      <div className="text-center py-8 text-[#aaaaaa]">
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
      {/* Pagination Info */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm text-[#555555]">
          <span>
            Showing {startIdx + 1} to {endIdx} of {result.rows.length} rows
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#e8e8e8] rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f5f5f5] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="px-3 py-1 text-[#555555]">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={currentPage === totalPages - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-[#e8e8e8] rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f5f5f5] transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Table Container */}
      <div className="relative">
        {/* Scroll indicator */}
        <div className="overflow-x-auto border border-[#e8e8e8] rounded-lg max-w-full">
          <table className="min-w-full divide-y divide-[#e8e8e8]">
            <thead className="bg-[#f5f5f5]">
              <tr>
                {columns.map((col, idx) => (
                  <th
                    key={idx}
                    className="px-4 py-3 text-left text-xs font-semibold text-[#1a1a1a] uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#f0f0f0]">
              {currentRows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-[#fafafa] transition-colors">
                  {columns.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      className="px-4 py-3 text-sm text-[#1a1a1a] whitespace-nowrap"
                    >
                      {row[col] === null ? (
                        <span className="text-[#aaaaaa] italic">NULL</span>
                      ) : typeof row[col] === 'object' ? (
                        <span className="text-xs font-mono text-[#555555]">
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

        {/* Scroll hint */}
        {columns.length > 5 && (
          <div className="mt-2 text-xs text-[#aaaaaa] text-center">
            ← Scroll horizontally to see all columns →
          </div>
        )}
      </div>
    </div>
  );
}
