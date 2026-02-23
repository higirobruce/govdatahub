'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { LineageGraph, NodeType, LineageNode } from '@/types/lineage';
import { LineageViewer } from '@/components/LineageViewer/LineageViewer';
import { LineageFilters } from '@/components/LineageViewer/LineageFilters';
import { NodeDetailsPanel } from '@/components/LineageViewer/NodeDetailsPanel';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Network } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

const ALL_NODE_TYPES = Object.values(NodeType);

export default function LineagePage() {
  const { showToast } = useToast();
  const [selectedNodeTypes, setSelectedNodeTypes] = useState<NodeType[]>(ALL_NODE_TYPES);
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);

  const {
    data: lineageGraph,
    isLoading,
    mutate,
  } = useSWR<LineageGraph>('lineage-graph', () =>
    api.lineage.getGraph({
      nodeTypes: selectedNodeTypes.length > 0 ? selectedNodeTypes : undefined,
    })
  );

  // Filter lineage graph based on selected node types
  const filteredLineageGraph = useMemo(() => {
    if (!lineageGraph) return null;

    // If all node types are selected, return the full graph
    if (selectedNodeTypes.length === ALL_NODE_TYPES.length) {
      return lineageGraph;
    }

    // Filter nodes
    const filteredNodes = lineageGraph.nodes.filter((node) =>
      selectedNodeTypes.includes(node.type)
    );
    const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges to only include those between filtered nodes
    const filteredEdges = lineageGraph.edges.filter(
      (edge) => filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        ...lineageGraph.metadata,
        totalNodes: filteredNodes.length,
        totalEdges: filteredEdges.length,
      },
    };
  }, [lineageGraph, selectedNodeTypes]);

  const handleRefresh = async () => {
    try {
      await mutate();
      showToast('Data lineage graph has been updated.', 'success');
    } catch (error) {
      showToast('Failed to refresh lineage graph.', 'error');
    }
  };

  const handleExport = () => {
    if (!filteredLineageGraph) return;

    const dataStr = JSON.stringify(filteredLineageGraph, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    const exportFileName = `lineage-graph-${new Date().toISOString()}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileName);
    linkElement.click();

    showToast('Lineage graph exported as JSON.', 'success');
  };

  const handleNodeClick = (nodeId: string) => {
    const node = filteredLineageGraph?.nodes.find((n) => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
    }
  };

  return (
    <div className="w-full flex flex-col h-full bg-gray-50 -m-4 md:-m-8 -mt-16 md:-mt-8">
      {/* Header */}
      <div className="px-6">
        <PageHeader
          title="Data Lineage"
          subtitle="Visualize how data flows through your system"
          icon={Network}
          className="mb-4"
          actions={
            <>
              {filteredLineageGraph && (
                <div className="text-sm text-gray-600 flex items-center">
                  <span className="font-semibold">{filteredLineageGraph.nodes.length}</span> nodes,{' '}
                  <span className="font-semibold ml-1">{filteredLineageGraph.edges.length}</span> edges
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={!filteredLineageGraph || filteredLineageGraph.nodes.length === 0}
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </>
          }
        />
      </div>

      {/* Filters */}
      <LineageFilters
        selectedNodeTypes={selectedNodeTypes}
        onNodeTypesChange={setSelectedNodeTypes}
      />

      {/* Main Content */}
      <div className="flex-1 relative">
        <LineageViewer
          lineageGraph={filteredLineageGraph}
          loading={isLoading}
          onNodeClick={handleNodeClick}
        />

        {/* Node Details Panel */}
        <NodeDetailsPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>
    </div>
  );
}
