'use client';

import { useState, useMemo } from 'react';

interface TableChartProps {
  rows: Record<string, any>[];
  fields: { name: string }[];
  height?: string;
}

/**
 * Table widget for displaying raw query results in a sortable, paginated table.
 */
export function TableChart({ rows, fields, height }: TableChartProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const sortedRows = useMemo(() => {
    if (!sortColumn) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (av == null && bv == null) return 0;
      if (av == null) return sortAsc ? 1 : -1;
      if (bv == null) return sortAsc ? -1 : 1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortAsc ? -1 : 1;
      if (as > bs) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, sortColumn, sortAsc]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const pagedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);

  const handleColumnClick = (col: string) => {
    if (sortColumn === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortColumn(col);
      setSortAsc(true);
      setPage(0);
    }
  };

  const start = totalRows === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalRows);

  const containerStyle: React.CSSProperties = height
    ? { maxHeight: height, overflowY: 'auto' }
    : {};

  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[#aaaaaa] text-sm"
        style={{ minHeight: '120px', ...containerStyle }}
      >
        No data
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="overflow-auto flex-1" style={containerStyle}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {fields.map((field) => (
                <th
                  key={field.name}
                  onClick={() => handleColumnClick(field.name)}
                  className="px-3 py-2 text-left font-semibold text-[#555555] border-b-2 border-[#e8e8e8] cursor-pointer hover:bg-[#f5f5f5] select-none whitespace-nowrap sticky top-0 bg-white z-10"
                >
                  {field.name}
                  {sortColumn === field.name && (
                    <span className="ml-1">{sortAsc ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="even:bg-[#fafafa] hover:bg-[#eff6ff]"
              >
                {fields.map((field) => {
                  const value = row[field.name];
                  const isNumber = typeof value === 'number';
                  const isNull = value == null;
                  return (
                    <td
                      key={field.name}
                      className={`px-3 py-1.5 border-b border-[#f0f0f0] whitespace-nowrap max-w-xs truncate${
                        isNumber ? ' text-right font-mono' : ''
                      }`}
                    >
                      {isNull ? (
                        <span className="text-[#aaaaaa]">—</span>
                      ) : (
                        String(value)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-[#e8e8e8] text-sm text-[#555555] shrink-0">
        <span>
          Showing {start}–{end} of {totalRows} rows
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-sm border border-[#e8e8e8] rounded hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-sm border border-[#e8e8e8] rounded hover:bg-[#f5f5f5] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
