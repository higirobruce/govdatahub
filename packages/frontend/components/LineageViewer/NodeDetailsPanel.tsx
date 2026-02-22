'use client';

import { LineageNode, NodeType } from '@/types/lineage';
import { Button } from '@/components/ui/button';
import { X, Database, Upload, FileText, GitBranch, Link as LinkIcon, Share2, Clock } from 'lucide-react';

interface NodeDetailsPanelProps {
  node: LineageNode | null;
  onClose: () => void;
}

const NODE_TYPE_LABELS = {
  [NodeType.CONNECTION]: 'Connection',
  [NodeType.IMPORT_JOB]: 'Import Job',
  [NodeType.STAGED_DATA]: 'Staged Data',
  [NodeType.TRANSFORMATION]: 'Transformation',
  [NodeType.CROSS_QUERY]: 'Cross Query',
  [NodeType.DATASET_SHARE]: 'Dataset Share',
};

const NODE_ICONS = {
  [NodeType.CONNECTION]: Database,
  [NodeType.IMPORT_JOB]: Upload,
  [NodeType.STAGED_DATA]: FileText,
  [NodeType.TRANSFORMATION]: GitBranch,
  [NodeType.CROSS_QUERY]: LinkIcon,
  [NodeType.DATASET_SHARE]: Share2,
};

export function NodeDetailsPanel({ node, onClose }: NodeDetailsPanelProps) {
  if (!node) return null;

  const Icon = NODE_ICONS[node.type];

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-50">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-gray-700" />
          </div>
          <div>
            <div className="text-xs text-gray-500">{NODE_TYPE_LABELS[node.type]}</div>
            <div className="font-semibold text-gray-900">{node.label}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="px-6 py-4 space-y-6">
        {/* ID */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">ID</div>
          <div className="text-sm font-mono text-gray-900 break-all">{node.id}</div>
        </div>

        {/* Status */}
        {node.metadata.status && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Status</div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  node.metadata.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : node.metadata.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : node.metadata.status === 'paused'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {node.metadata.status.charAt(0).toUpperCase() + node.metadata.status.slice(1)}
              </span>
            </div>
          </div>
        )}

        {/* Connection Type */}
        {node.metadata.connectionType && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Connection Type</div>
            <div className="text-sm text-gray-900 font-mono">{node.metadata.connectionType}</div>
          </div>
        )}

        {/* Source Type */}
        {node.metadata.sourceType && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Source Type</div>
            <div className="text-sm text-gray-900 font-mono">{node.metadata.sourceType}</div>
          </div>
        )}

        {/* Table Name */}
        {node.metadata.tableName && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Table Name</div>
            <div className="text-sm text-gray-900 font-mono">{node.metadata.tableName}</div>
          </div>
        )}

        {/* Dataset Type */}
        {node.metadata.datasetType && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Dataset Type</div>
            <div className="text-sm text-gray-900">{node.metadata.datasetType}</div>
          </div>
        )}

        {/* Row Count */}
        {node.metadata.rowCount !== undefined && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Row Count</div>
            <div className="text-sm text-gray-900 font-semibold">
              {node.metadata.rowCount.toLocaleString()}
            </div>
          </div>
        )}

        {/* Last Run At */}
        {node.metadata.lastRunAt && (
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Last Run</div>
            <div className="flex items-center gap-2 text-sm text-gray-900">
              <Clock className="w-4 h-4 text-gray-400" />
              {new Date(node.metadata.lastRunAt).toLocaleString()}
            </div>
          </div>
        )}

        {/* Created At */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Created At</div>
          <div className="flex items-center gap-2 text-sm text-gray-900">
            <Clock className="w-4 h-4 text-gray-400" />
            {new Date(node.metadata.createdAt).toLocaleString()}
          </div>
        </div>

        {/* Metadata Section */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">Metadata</div>
          <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-700 overflow-auto max-h-64">
            <pre>{JSON.stringify(node.metadata, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
