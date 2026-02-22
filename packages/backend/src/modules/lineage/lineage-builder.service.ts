import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Connection,
  ImportJob,
  StagedData,
  Transformation,
  TransformationRun,
  SavedCrossQuery,
  DatasetShare,
} from '../../database/entities';
import {
  LineageGraph,
  LineageNode,
  LineageEdge,
  NodeType,
  EdgeType,
} from './types/lineage.types';
import { LineageQueryDto } from './dto/lineage-query.dto';

@Injectable()
export class LineageBuilderService {
  constructor(
    @InjectRepository(Connection)
    private connectionRepo: Repository<Connection>,
    @InjectRepository(ImportJob)
    private importJobRepo: Repository<ImportJob>,
    @InjectRepository(StagedData)
    private stagedDataRepo: Repository<StagedData>,
    @InjectRepository(Transformation)
    private transformationRepo: Repository<Transformation>,
    @InjectRepository(TransformationRun)
    private transformationRunRepo: Repository<TransformationRun>,
    @InjectRepository(SavedCrossQuery)
    private crossQueryRepo: Repository<SavedCrossQuery>,
    @InjectRepository(DatasetShare)
    private datasetShareRepo: Repository<DatasetShare>,
  ) {}

  async buildLineageGraph(
    organizationId: string,
    query: LineageQueryDto,
  ): Promise<LineageGraph> {
    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];
    const nodeIds = new Set<string>();

    // 1. Load all entities for this organization
    const connections = await this.connectionRepo.find({
      where: { organizationId },
    });

    const importJobs = await this.importJobRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: 500, // Limit to recent 500 imports
    });

    const stagedData = await this.stagedDataRepo.find({
      where: { organizationId },
    });

    const transformations = await this.transformationRepo.find({
      where: { organizationId },
    });

    const crossQueries = await this.crossQueryRepo.find({
      where: { organizationId },
    });

    const shares = await this.datasetShareRepo.find({
      where: { organizationId, active: true },
    });

    // 2. Build nodes for connections
    for (const conn of connections) {
      const node: LineageNode = {
        id: `connection-${conn.id}`,
        type: NodeType.CONNECTION,
        label: conn.name,
        metadata: {
          connectionType: conn.type,
          createdAt: conn.createdAt,
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);
    }

    // 3. Build nodes and edges for import jobs
    for (const job of importJobs) {
      const node: LineageNode = {
        id: `import_job-${job.id}`,
        type: NodeType.IMPORT_JOB,
        label: job.fileName,
        metadata: {
          status: job.status as any,
          rowCount: job.rowsSucceeded,
          sourceType: job.sourceType,
          createdAt: job.createdAt,
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);

      // Edge: Source connection -> Import job (for database imports)
      if (job.sourceConnectionId && nodeIds.has(`connection-${job.sourceConnectionId}`)) {
        edges.push({
          id: `${job.sourceConnectionId}-importjob-${job.id}`,
          source: `connection-${job.sourceConnectionId}`,
          target: `import_job-${job.id}`,
          type: EdgeType.DATA_FLOW,
          label: 'imports from',
          metadata: {
            rowsProcessed: job.rowsSucceeded,
            lastExecutedAt: job.completedAt,
          },
        });
      }

      // Edge: Import job -> Target connection (for database targets)
      if (job.connectionId && job.targetType === 'database' && nodeIds.has(`connection-${job.connectionId}`)) {
        edges.push({
          id: `importjob-${job.id}-${job.connectionId}`,
          source: `import_job-${job.id}`,
          target: `connection-${job.connectionId}`,
          type: EdgeType.DATA_FLOW,
          label: 'loads to',
        });
      }
    }

    // 4. Build nodes and edges for staged data
    for (const staged of stagedData) {
      const node: LineageNode = {
        id: `staged_data-${staged.id}`,
        type: NodeType.STAGED_DATA,
        label: staged.tableName,
        metadata: {
          rowCount: staged.rowCount,
          tableName: staged.tableName,
          createdAt: staged.createdAt,
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);

      // Edge: Import job -> Staged data
      if (staged.importJobId && nodeIds.has(`import_job-${staged.importJobId}`)) {
        edges.push({
          id: `importjob-${staged.importJobId}-staged-${staged.id}`,
          source: `import_job-${staged.importJobId}`,
          target: `staged_data-${staged.id}`,
          type: EdgeType.DATA_FLOW,
          label: 'creates',
          metadata: {
            rowsProcessed: staged.rowCount,
          },
        });
      }
    }

    // 5. Build nodes and edges for transformations
    for (const transform of transformations) {
      const node: LineageNode = {
        id: `transformation-${transform.id}`,
        type: NodeType.TRANSFORMATION,
        label: transform.name,
        metadata: {
          status: transform.status as any,
          lastRunAt: transform.lastRunAt ?? undefined,
          createdAt: transform.createdAt,
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);

      // Edge: Source connection -> Transformation
      if (transform.sourceConnectionId && nodeIds.has(`connection-${transform.sourceConnectionId}`)) {
        const edgeId = `conn-${transform.sourceConnectionId}-transform-${transform.id}`;
        const edge: LineageEdge = {
          id: edgeId,
          source: `connection-${transform.sourceConnectionId}`,
          target: `transformation-${transform.id}`,
          type: EdgeType.DERIVED_FROM,
          label: 'transforms',
        };

        // Get latest transformation run for metadata
        try {
          const latestRun = await this.transformationRunRepo.findOne({
            where: { transformationId: transform.id },
            order: { startedAt: 'DESC' },
          });

          if (latestRun) {
            edge.metadata = {
              rowsProcessed: latestRun.rowsProcessed ?? undefined,
              executionTimeMs: latestRun.executionTimeMs ?? undefined,
              lastExecutedAt: latestRun.completedAt ?? undefined,
            };
          }
        } catch (error) {
          // Ignore errors in fetching run metadata
        }

        edges.push(edge);
      }
    }

    // 6. Build nodes for cross-queries
    for (const crossQuery of crossQueries) {
      const node: LineageNode = {
        id: `cross_query-${crossQuery.id}`,
        type: NodeType.CROSS_QUERY,
        label: crossQuery.name,
        metadata: {
          createdAt: crossQuery.createdAt,
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);

      // Parse query definition to extract source connections
      try {
        const queryDef = crossQuery.queryDefinition as any;
        if (queryDef && queryDef.tables && Array.isArray(queryDef.tables)) {
          const uniqueConnections = new Set<string>(
            queryDef.tables.map((t: any) => t.connectionId).filter(Boolean),
          );

          for (const connId of uniqueConnections) {
            if (nodeIds.has(`connection-${connId}`)) {
              edges.push({
                id: `conn-${connId}-crossquery-${crossQuery.id}`,
                source: `connection-${connId}`,
                target: `cross_query-${crossQuery.id}`,
                type: EdgeType.DERIVED_FROM,
                label: 'queries',
              });
            }
          }
        }
      } catch (error) {
        // Ignore errors in parsing query definition
      }
    }

    // 7. Build nodes and edges for dataset shares
    for (const share of shares) {
      const node: LineageNode = {
        id: `dataset_share-${share.id}`,
        type: NodeType.DATASET_SHARE,
        label: share.name,
        metadata: {
          datasetType: share.datasetType,
          rowCount: share.rowCount,
          createdAt: share.createdAt,
        },
      };
      nodes.push(node);
      nodeIds.add(node.id);

      // Edge: Source dataset -> Share
      const sourceNodeId = `${share.datasetType}-${share.datasetId}`;
      if (nodeIds.has(sourceNodeId)) {
        edges.push({
          id: `${share.datasetType}-${share.datasetId}-share-${share.id}`,
          source: sourceNodeId,
          target: `dataset_share-${share.id}`,
          type: EdgeType.SHARED_AS,
          label: 'shared as',
        });
      }
    }

    // 8. Apply filters from query
    let filteredNodes = nodes;
    let filteredEdges = edges;

    if (query.nodeTypes && query.nodeTypes.length > 0) {
      filteredNodes = nodes.filter((n) => query.nodeTypes!.includes(n.type));
      const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = edges.filter(
        (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
      );
    }

    if (query.datasetId) {
      // Extract subgraph for specific dataset
      const { nodes: subNodes, edges: subEdges } = this.extractSubgraph(
        nodes,
        edges,
        query.datasetId,
        query.direction || 'both',
        query.maxDepth || 3,
      );
      filteredNodes = subNodes;
      filteredEdges = subEdges;
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      metadata: {
        totalNodes: filteredNodes.length,
        totalEdges: filteredEdges.length,
        generatedAt: new Date(),
      },
    };
  }

  extractSubgraph(
    allNodes: LineageNode[],
    allEdges: LineageEdge[],
    rootId: string,
    direction: 'upstream' | 'downstream' | 'both',
    maxDepth: number,
  ): { nodes: LineageNode[]; edges: LineageEdge[] } {
    const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
    const edgesBySource = new Map<string, LineageEdge[]>();
    const edgesByTarget = new Map<string, LineageEdge[]>();

    // Build adjacency maps
    for (const edge of allEdges) {
      if (!edgesBySource.has(edge.source)) {
        edgesBySource.set(edge.source, []);
      }
      edgesBySource.get(edge.source)!.push(edge);

      if (!edgesByTarget.has(edge.target)) {
        edgesByTarget.set(edge.target, []);
      }
      edgesByTarget.get(edge.target)!.push(edge);
    }

    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();

    // BFS traversal
    const traverse = (
      startId: string,
      goUpstream: boolean,
      goDownstream: boolean,
    ) => {
      const queue: Array<{ id: string; depth: number }> = [
        { id: startId, depth: 0 },
      ];

      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;

        const { id, depth } = item;

        if (visitedNodes.has(id) || depth > maxDepth) continue;
        visitedNodes.add(id);

        // Traverse upstream (sources)
        if (goUpstream && depth < maxDepth) {
          const incomingEdges = edgesByTarget.get(id) || [];
          for (const edge of incomingEdges) {
            visitedEdges.add(edge.id);
            queue.push({ id: edge.source, depth: depth + 1 });
          }
        }

        // Traverse downstream (targets)
        if (goDownstream && depth < maxDepth) {
          const outgoingEdges = edgesBySource.get(id) || [];
          for (const edge of outgoingEdges) {
            visitedEdges.add(edge.id);
            queue.push({ id: edge.target, depth: depth + 1 });
          }
        }
      }
    };

    traverse(
      rootId,
      direction === 'upstream' || direction === 'both',
      direction === 'downstream' || direction === 'both',
    );

    const nodes = Array.from(visitedNodes)
      .map((id) => nodeMap.get(id))
      .filter((n): n is LineageNode => n !== undefined);

    const edges = Array.from(visitedEdges)
      .map((id) => allEdges.find((e) => e.id === id))
      .filter((e): e is LineageEdge => e !== undefined);

    return { nodes, edges };
  }
}
