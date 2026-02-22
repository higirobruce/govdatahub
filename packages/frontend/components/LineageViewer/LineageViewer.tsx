'use client';

import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { LineageNode as LineageNodeComponent } from './LineageNode';
import { LineageGraph, NodeType, EdgeType } from '@/types/lineage';
import { Database } from 'lucide-react';

interface LineageViewerProps {
  lineageGraph: LineageGraph | null;
  loading: boolean;
  onNodeClick?: (nodeId: string) => void;
}

const nodeTypes = {
  lineageNode: LineageNodeComponent,
};

// Color coding for edges based on type
const EDGE_COLORS = {
  [EdgeType.DATA_FLOW]: '#3b82f6', // blue
  [EdgeType.DERIVED_FROM]: '#8b5cf6', // purple
  [EdgeType.SHARED_AS]: '#ec4899', // pink
};

// Dagre layout configuration
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const nodeWidth = 200;
  const nodeHeight = 120;

  dagreGraph.setGraph({
    rankdir: 'LR', // Left to right
    ranksep: 100,
    nodesep: 80,
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function LineageViewer({ lineageGraph, loading, onNodeClick }: LineageViewerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Convert lineage graph to React Flow format and apply layout
  useEffect(() => {
    if (!lineageGraph) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Convert nodes
    const flowNodes: Node[] = lineageGraph.nodes.map((node) => ({
      id: node.id,
      type: 'lineageNode',
      position: { x: 0, y: 0 }, // Will be set by dagre
      data: {
        nodeType: node.type,
        label: node.label,
        metadata: node.metadata,
        onClick: () => onNodeClick?.(node.id),
      },
    }));

    // Convert edges
    const flowEdges: Edge[] = lineageGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: 'smoothstep',
      animated: true,
      style: {
        stroke: EDGE_COLORS[edge.type] || '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: EDGE_COLORS[edge.type] || '#94a3b8',
      },
    }));

    // Apply dagre layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      flowNodes,
      flowEdges
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [lineageGraph, onNodeClick, setNodes, setEdges]);

  const nodeColor = useCallback((node: Node) => {
    // Color for minimap
    switch (node.data.nodeType) {
      case NodeType.CONNECTION:
        return '#3b82f6'; // blue
      case NodeType.IMPORT_JOB:
        return '#10b981'; // green
      case NodeType.STAGED_DATA:
        return '#f59e0b'; // yellow
      case NodeType.TRANSFORMATION:
        return '#8b5cf6'; // purple
      case NodeType.CROSS_QUERY:
        return '#6366f1'; // indigo
      case NodeType.DATASET_SHARE:
        return '#ec4899'; // pink
      default:
        return '#64748b'; // gray
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading lineage graph...</p>
        </div>
      </div>
    );
  }

  if (!lineageGraph || lineageGraph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center max-w-md">
          <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Data Lineage Available
          </h3>
          <p className="text-gray-600 mb-4">
            Create connections, import data, or set up transformations to see the data flow.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
        defaultEdgeOptions={{
          animated: true,
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
        <MiniMap nodeColor={nodeColor} zoomable pannable />
      </ReactFlow>
    </div>
  );
}
