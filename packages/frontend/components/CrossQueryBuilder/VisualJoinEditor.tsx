'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Connection,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  ConnectionLineType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { QueryDefinition, JoinDefinition } from '@/types/cross-query';
import { TableNode, TableNodeData } from './TableNode';
import { JoinConfigDialog } from './JoinConfigDialog';
import { api } from '@/lib/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

const nodeTypes = {
  tableNode: TableNode,
};

interface VisualJoinEditorProps {
  queryDefinition: QueryDefinition;
  onQueryChange: (query: QueryDefinition) => void;
}

interface PendingJoin {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  edgeId: string;
}

export function VisualJoinEditor({ queryDefinition, onQueryChange }: VisualJoinEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [tableColumns, setTableColumns] = useState<Map<string, any[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(null);

  // Load columns for all tables
  useEffect(() => {
    loadTableColumns();
  }, [queryDefinition.tables]);

  // Update nodes when tables change
  useEffect(() => {
    if (tableColumns.size > 0) {
      updateNodes();
    }
  }, [queryDefinition.tables, tableColumns]);

  // Update edges when joins change
  useEffect(() => {
    updateEdges();
  }, [queryDefinition.joins]);

  const loadTableColumns = async () => {
    if (queryDefinition.tables.length === 0) {
      setTableColumns(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const columnsMap = new Map();

      for (const table of queryDefinition.tables) {
        const columns = await api.schema.getColumns(
          table.connectionId,
          table.tableName,
          table.schemaName
        );
        columnsMap.set(table.alias, columns);
      }

      setTableColumns(columnsMap);
    } catch (error) {
      console.error('Failed to load columns:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateNodes = () => {
    const newNodes: Node<TableNodeData>[] = queryDefinition.tables.map((table, index) => {
      const columns = tableColumns.get(table.alias) || [];

      return {
        id: table.alias,
        type: 'tableNode',
        position: calculateNodePosition(index, queryDefinition.tables.length),
        data: {
          alias: table.alias,
          tableName: table.tableName,
          schemaName: table.schemaName,
          columns: columns.map((col: any) => ({
            name: col.name,
            type: col.type,
          })),
          onRemove: () => removeTable(table.alias),
        },
      };
    });

    setNodes(newNodes);
  };

  const calculateNodePosition = (index: number, total: number): { x: number; y: number } => {
    // Simple horizontal layout with some vertical offset
    const spacing = 400;
    const row = Math.floor(index / 3);
    const col = index % 3;

    return {
      x: col * spacing + 50,
      y: row * 300 + 50,
    };
  };

  const updateEdges = () => {
    const newEdges: Edge[] = queryDefinition.joins.map((join, index) => {
      // For simplicity, use the first condition's columns
      const condition = join.conditions[0];

      return {
        id: `join-${index}`,
        source: join.leftTable,
        target: join.rightTable,
        sourceHandle: `${join.leftTable}-${condition.leftColumn}-source`,
        targetHandle: `${join.rightTable}-${condition.rightColumn}-target`,
        label: join.type,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        labelStyle: { fill: '#3b82f6', fontWeight: 600 },
        data: { join },
      };
    });

    setEdges(newEdges);
  };

  const removeTable = (alias: string) => {
    // Remove table
    const newTables = queryDefinition.tables.filter((t) => t.alias !== alias);

    // Remove related joins
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
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
        return;
      }

      // Parse source and target handles to extract table and column names
      // Format: "tablealias-columnname-source" or "tablealias-columnname-target"
      const sourceTable = connection.source;
      const targetTable = connection.target;

      const sourceColumn = connection.sourceHandle.replace(`${sourceTable}-`, '').replace('-source', '');
      const targetColumn = connection.targetHandle.replace(`${targetTable}-`, '').replace('-target', '');

      // Check if join already exists
      const existingJoin = queryDefinition.joins.find(
        (j) =>
          (j.leftTable === sourceTable && j.rightTable === targetTable) ||
          (j.leftTable === targetTable && j.rightTable === sourceTable)
      );

      if (existingJoin) {
        // Update existing join
        alert('Join already exists between these tables. Edit it in the join list.');
        return;
      }

      // Create a temporary edge ID
      const tempEdgeId = `temp-${Date.now()}`;

      // Show join config dialog
      setPendingJoin({
        leftTable: sourceTable,
        leftColumn: sourceColumn,
        rightTable: targetTable,
        rightColumn: targetColumn,
        edgeId: tempEdgeId,
      });
    },
    [queryDefinition.joins]
  );

  const handleSaveJoin = (join: JoinDefinition) => {
    const newJoins = [...queryDefinition.joins, join];

    onQueryChange({
      ...queryDefinition,
      joins: newJoins,
    });

    setPendingJoin(null);
  };

  const handleCancelJoin = () => {
    setPendingJoin(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (queryDefinition.tables.length === 0) {
    return (
      <Alert>
        <AlertDescription>Add tables to start building joins</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="relative">
      <div className="h-[800px] border rounded-lg bg-muted/20">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          minZoom={0.5}
          maxZoom={1.5}
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
        </ReactFlow>
      </div>

      {/* Join Config Dialog */}
      {pendingJoin && (
        <JoinConfigDialog
          leftTable={pendingJoin.leftTable}
          leftColumn={pendingJoin.leftColumn}
          rightTable={pendingJoin.rightTable}
          rightColumn={pendingJoin.rightColumn}
          onSave={handleSaveJoin}
          onCancel={handleCancelJoin}
        />
      )}
    </div>
  );
}
