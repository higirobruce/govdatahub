'use client';

import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { StepNode, StepNodeData } from './StepNode';
import { PipelineStep, PipelineEdge, StepRunResult } from '@/types/pipeline';

const nodeTypes = { stepNode: StepNode };

interface PipelineCanvasProps {
  steps: PipelineStep[];
  edges: PipelineEdge[];
  runResults?: Record<string, StepRunResult>;
  selectedStepId: string | null;
  onSelectStep: (stepId: string | null) => void;
  onUpdatePositions: (steps: PipelineStep[]) => void;
  onAddEdge: (edge: PipelineEdge) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteStep: (stepId: string) => void;
}

export default function PipelineCanvas({
  steps,
  edges,
  runResults,
  selectedStepId,
  onSelectStep,
  onUpdatePositions,
  onAddEdge,
  onDeleteEdge,
  onDeleteStep,
}: PipelineCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNodeData>([]);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState([]);

  // Sync steps → nodes
  useEffect(() => {
    setNodes(
      steps.map((step) => ({
        id: step.id,
        type: 'stepNode',
        position: step.position,
        data: {
          label: step.label,
          type: step.type,
          runResult: runResults?.[step.id],
          selected: step.id === selectedStepId,
        },
        selected: step.id === selectedStepId,
      })),
    );
  }, [steps, runResults, selectedStepId, setNodes]);

  // Sync edges → RF edges
  useEffect(() => {
    setEdges(
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#aaaaaa' },
        style: { stroke: '#aaaaaa', strokeWidth: 2 },
      })),
    );
  }, [edges, setEdges]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: PipelineEdge = {
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
      };
      onAddEdge(newEdge);
    },
    [onAddEdge],
  );

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      onNodesChange(changes);
      // Flush position changes back to parent
      const positionChanges = changes.filter((c) => c.type === 'position' && c.dragging === false);
      if (positionChanges.length > 0) {
        const updated = steps.map((step) => {
          const change = positionChanges.find((c) => c.id === step.id);
          if (change?.position) {
            return { ...step, position: change.position };
          }
          return step;
        });
        onUpdatePositions(updated);
      }
    },
    [onNodesChange, steps, onUpdatePositions],
  );

  const handleEdgesChange = useCallback(
    (changes: any[]) => {
      onEdgesChange(changes);
      const removed = changes.filter((c) => c.type === 'remove');
      removed.forEach((c) => onDeleteEdge(c.id));
    },
    [onEdgesChange, onDeleteEdge],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectStep(node.id);
    },
    [onSelectStep],
  );

  const handlePaneClick = useCallback(() => {
    onSelectStep(null);
  }, [onSelectStep]);

  return (
    <div className="w-full h-full bg-[#f8f8f8]">
      <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        deleteKeyCode="Delete"
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e8e8e8" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const t = (n.data as StepNodeData)?.type;
            if (t === 'ingest') return '#3b82f6';
            if (t === 'transform') return '#8b5cf6';
            if (t === 'cross-query') return '#f97316';
            if (t === 'export') return '#10b981';
            return '#aaaaaa';
          }}
          style={{ backgroundColor: '#fafafa', border: '1px solid #e8e8e8' }}
        />
      </ReactFlow>
    </div>
  );
}
