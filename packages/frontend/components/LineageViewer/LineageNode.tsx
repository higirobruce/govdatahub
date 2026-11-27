'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NodeType } from '@/types/lineage';
import {
  Database,
  Upload,
  FileText,
  GitBranch,
  Link as LinkIcon,
  Share2,
  CheckCircle,
  XCircle,
  Pause,
  Clock,
} from 'lucide-react';

interface LineageNodeData {
  nodeType: NodeType;
  label: string;
  metadata: any;
  onClick?: () => void;
}

const NODE_COLORS = {
  [NodeType.CONNECTION]: 'bg-blue-50 border-blue-300',
  [NodeType.IMPORT_JOB]: 'bg-green-50 border-green-300',
  [NodeType.STAGED_DATA]: 'bg-yellow-50 border-yellow-300',
  [NodeType.TRANSFORMATION]: 'bg-purple-50 border-purple-300',
  [NodeType.CROSS_QUERY]: 'bg-indigo-50 border-indigo-300',
  [NodeType.DATASET_SHARE]: 'bg-pink-50 border-pink-300',
};

const NODE_ICONS = {
  [NodeType.CONNECTION]: Database,
  [NodeType.IMPORT_JOB]: Upload,
  [NodeType.STAGED_DATA]: FileText,
  [NodeType.TRANSFORMATION]: GitBranch,
  [NodeType.CROSS_QUERY]: LinkIcon,
  [NodeType.DATASET_SHARE]: Share2,
};

const STATUS_ICONS = {
  completed: CheckCircle,
  active: CheckCircle,
  failed: XCircle,
  paused: Pause,
};

export const LineageNode = memo(({ data }: NodeProps<LineageNodeData>) => {
  const { nodeType, label, metadata, onClick } = data;
  const Icon = NODE_ICONS[nodeType];
  const StatusIcon = metadata.status ? STATUS_ICONS[metadata.status as keyof typeof STATUS_ICONS] : null;

  return (
    <div
      className={`${NODE_COLORS[nodeType]} border-2 rounded-lg shadow-md min-w-[180px] cursor-pointer hover:shadow-lg transition-shadow`}
      onClick={onClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-gray-600"
      />

      {/* Header */}
      <div className="bg-[#1a1a1a] text-white px-3 py-2 rounded-t-md flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium text-sm truncate">{label}</span>
        </div>
        {StatusIcon && (
          <StatusIcon
            className={`w-4 h-4 flex-shrink-0 ${
              metadata.status === 'failed'
                ? 'text-red-300'
                : metadata.status === 'paused'
                ? 'text-yellow-300'
                : 'text-green-300'
            }`}
          />
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2 text-xs space-y-1">
        {metadata.connectionType && (
          <div className="text-gray-600">
            Type: <span className="font-mono">{metadata.connectionType}</span>
          </div>
        )}
        {metadata.rowCount !== undefined && (
          <div className="text-gray-600">
            Rows: <span className="font-semibold">{metadata.rowCount.toLocaleString()}</span>
          </div>
        )}
        {metadata.tableName && (
          <div className="text-gray-600">
            Table: <span className="font-mono truncate">{metadata.tableName}</span>
          </div>
        )}
        {metadata.lastRunAt && (
          <div className="text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(metadata.lastRunAt).toLocaleDateString()}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-gray-600"
      />
    </div>
  );
});

LineageNode.displayName = 'LineageNode';
