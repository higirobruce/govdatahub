'use client';

import { useState } from 'react';
import { NodeType } from '@/types/lineage';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

interface LineageFiltersProps {
  selectedNodeTypes: NodeType[];
  onNodeTypesChange: (nodeTypes: NodeType[]) => void;
}

const NODE_TYPE_LABELS = {
  [NodeType.CONNECTION]: 'Connections',
  [NodeType.IMPORT_JOB]: 'Import Jobs',
  [NodeType.STAGED_DATA]: 'Staged Data',
  [NodeType.TRANSFORMATION]: 'Transformations',
  [NodeType.CROSS_QUERY]: 'Cross Queries',
  [NodeType.DATASET_SHARE]: 'Dataset Shares',
};

const ALL_NODE_TYPES = Object.values(NodeType);

export function LineageFilters({ selectedNodeTypes, onNodeTypesChange }: LineageFiltersProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleNodeTypeToggle = (nodeType: NodeType) => {
    if (selectedNodeTypes.includes(nodeType)) {
      onNodeTypesChange(selectedNodeTypes.filter((t) => t !== nodeType));
    } else {
      onNodeTypesChange([...selectedNodeTypes, nodeType]);
    }
  };

  const handleClearFilters = () => {
    onNodeTypesChange(ALL_NODE_TYPES);
  };

  const activeFilterCount =
    ALL_NODE_TYPES.length - selectedNodeTypes.length;

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="px-6 py-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount}
              </Badge>
            )}
          </button>

          {activeFilterCount > 0 && !isCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-7 text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {!isCollapsed && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-500 mb-2">Node Types</div>
            <div className="grid grid-cols-2 gap-2">
              {ALL_NODE_TYPES.map((nodeType) => (
                <div key={nodeType} className="flex items-center space-x-2">
                  <Checkbox
                    id={`filter-${nodeType}`}
                    checked={selectedNodeTypes.includes(nodeType)}
                    onCheckedChange={() => handleNodeTypeToggle(nodeType)}
                  />
                  <Label
                    htmlFor={`filter-${nodeType}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {NODE_TYPE_LABELS[nodeType]}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
