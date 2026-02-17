'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Table, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface TableNodeData {
  alias: string;
  tableName: string;
  schemaName: string;
  columns: Array<{
    name: string;
    type: string;
  }>;
  onRemove: () => void;
}

function TableNodeComponent({ data }: NodeProps<TableNodeData>) {
  return (
    <div className="bg-card border-2 border-border rounded-lg shadow-lg min-w-[250px]">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table className="h-4 w-4" />
          <div>
            <div className="font-semibold">{data.alias}</div>
            <div className="text-xs opacity-80">
              {data.schemaName}.{data.tableName}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={data.onRemove}
          className="h-6 w-6 p-0 hover:bg-primary-foreground/20"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Columns */}
      <div className="py-2">
        {data.columns.map((column, index) => (
          <div
            key={column.name}
            className="relative px-4 py-2 hover:bg-accent group flex items-center justify-between"
          >
            {/* Left handle for incoming connections */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${data.alias}-${column.name}-target`}
              className="!bg-primary !border-2 !border-background !w-3 !h-3"
              style={{ left: -6 }}
            />

            {/* Column info */}
            <div className="flex-1">
              <div className="text-sm font-medium">{column.name}</div>
              <div className="text-xs text-muted-foreground">{column.type}</div>
            </div>

            {/* Right handle for outgoing connections */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${data.alias}-${column.name}-source`}
              className="!bg-primary !border-2 !border-background !w-3 !h-3"
              style={{ right: -6 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
