'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ConnectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { QueryDefinition, JoinDefinition } from '@/types';
import { TableNode } from './TableNode';
import { JoinConfigDialog } from './JoinConfigDialog';

const nodeTypes = {
  table: TableNode,
};

interface VisualJoinEditorProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (definition: QueryDefinition) => void;
}

export function VisualJoinEditor({
  queryDefinition,
  onQueryChange,
}: VisualJoinEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  // Convert query definition tables to nodes
  useEffect(() => {
    const newNodes: Node[] = queryDefinition.tables.map((table, index) => ({
      id: table.alias,
      type: 'table',
      position: {
        x: 50 + (index % 3) * 300,
        y: 50 + Math.floor(index / 3) * 250,
      },
      data: {
        table,
        onRemove: () => handleRemoveTable(table.alias),
      },
    }));

    setNodes(newNodes);
  }, [queryDefinition.tables]);

  // Convert query definition joins to edges
  useEffect(() => {
    const newEdges: Edge[] = queryDefinition.joins.map((join, index) => ({
      id: `join-${index}`,
      source: join.leftTable,
      target: join.rightTable,
      label: `${join.type} JOIN`,
      animated: true,
      style: { stroke: '#6366f1', strokeWidth: 2 },
    }));

    setEdges(newEdges);
  }, [queryDefinition.joins]);

  const handleRemoveTable = (alias: string) => {
    // Remove table
    const newTables = queryDefinition.tables.filter((t) => t.alias !== alias);
    
    // Remove joins involving this table
    const newJoins = queryDefinition.joins.filter(
      (j) => j.leftTable !== alias && j.rightTable !== alias
    );
    
    // Remove columns from this table
    const newColumns = queryDefinition.columns.filter((c) => c.table !== alias);
    
    onQueryChange({
      ...queryDefinition,
      tables: newTables,
      joins: newJoins,
      columns: newColumns,
    });
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Check if join already exists
      const joinExists = queryDefinition.joins.some(
        (j) =>
          (j.leftTable === connection.source && j.rightTable === connection.target) ||
          (j.leftTable === connection.target && j.rightTable === connection.source)
      );

      if (joinExists) {
        alert('A join already exists between these tables');
        return;
      }

      // Create a default join
      const newJoin: JoinDefinition = {
        type: 'INNER',
        leftTable: connection.source,
        rightTable: connection.target,
        conditions: [
          {
            leftColumn: 'id', // Default - user can edit
            operator: '=',
            rightColumn: 'id', // Default - user can edit
          },
        ],
      };

      onQueryChange({
        ...queryDefinition,
        joins: [...queryDefinition.joins, newJoin],
      });

      // Open dialog to configure the join
      setTimeout(() => {
        setSelectedEdge(`join-${queryDefinition.joins.length}`);
        setJoinDialogOpen(true);
      }, 100);
    },
    [queryDefinition, onQueryChange]
  );

  const handleEdgeClick = (event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setSelectedEdge(edge.id);
    setJoinDialogOpen(true);
  };

  const handleUpdateJoin = (joinIndex: number, updatedJoin: JoinDefinition) => {
    const newJoins = [...queryDefinition.joins];
    newJoins[joinIndex] = updatedJoin;
    
    onQueryChange({
      ...queryDefinition,
      joins: newJoins,
    });
    
    setJoinDialogOpen(false);
    setSelectedEdge(null);
  };

  const handleDeleteJoin = (joinIndex: number) => {
    const newJoins = queryDefinition.joins.filter((_, index) => index !== joinIndex);
    
    onQueryChange({
      ...queryDefinition,
      joins: newJoins,
    });
    
    setJoinDialogOpen(false);
    setSelectedEdge(null);
  };

  const selectedJoinIndex = selectedEdge
    ? parseInt(selectedEdge.replace('join-', ''))
    : -1;

  if (queryDefinition.tables.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
        <div className="text-center text-gray-500">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium">No tables selected</h3>
          <p className="mt-1 text-sm">
            Add tables from the sidebar to start building your query
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={handleEdgeClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background />
        <Controls />
      </ReactFlow>

      {joinDialogOpen && selectedJoinIndex >= 0 && (
        <JoinConfigDialog
          join={queryDefinition.joins[selectedJoinIndex]}
          tables={queryDefinition.tables}
          onSave={(updatedJoin) => handleUpdateJoin(selectedJoinIndex, updatedJoin)}
          onDelete={() => handleDeleteJoin(selectedJoinIndex)}
          onClose={() => {
            setJoinDialogOpen(false);
            setSelectedEdge(null);
          }}
        />
      )}
    </>
  );
}
