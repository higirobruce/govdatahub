'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { TableReference } from '@/types';

interface TableNodeData {
  table: TableReference;
  onRemove: () => void;
}

export const TableNode = memo(({ data }: NodeProps<TableNodeData>) => {
  const { table, onRemove } = data;

  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg shadow-lg min-w-[200px]">
      {/* Handle for incoming connections */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-indigo-500"
      />

      {/* Table Header */}
      <div className="bg-indigo-600 text-white px-3 py-2 rounded-t-md">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{table.alias}</div>
            <div className="text-xs opacity-90 truncate">
              {table.schemaName}.{table.tableName}
            </div>
          </div>
          <button
            onClick={onRemove}
            className="ml-2 text-white hover:text-red-200 transition-colors"
            title="Remove table"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Table Body */}
      <div className="px-3 py-2">
        <div className="text-xs text-gray-600">
          {table.columns && table.columns.length > 0 ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {table.columns.slice(0, 10).map((col) => (
                <div key={col.name} className="flex items-center justify-between py-0.5">
                  <span className="font-mono truncate">{col.name}</span>
                  <span className="text-gray-400 ml-2 text-[10px]">{col.type}</span>
                </div>
              ))}
              {table.columns.length > 10 && (
                <div className="text-gray-400 italic">
                  +{table.columns.length - 10} more columns
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400 italic py-2">Loading columns...</div>
          )}
        </div>
      </div>

      {/* Handle for outgoing connections */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-indigo-500"
      />
    </div>
  );
});

TableNode.displayName = 'TableNode';
