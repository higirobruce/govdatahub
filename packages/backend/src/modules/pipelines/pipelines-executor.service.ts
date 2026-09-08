import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Pipeline,
  PipelineRun,
  SavedCrossQuery,
  StepRunResult,
} from '../../database/entities';
import { PipelineStep } from '../../database/entities/pipeline.entity';
import { TransformationsExecutorService } from '../transformations/transformations-executor.service';
import { CrossQueryExecutorService } from '../cross-query/cross-query-executor.service';
import { DatabaseSourceImporterService } from '../ingestion/importers/database-source-importer.service';
import { PipelinesSchedulerService } from './pipelines-scheduler.service';

@Injectable()
export class PipelinesExecutorService implements OnModuleInit {
  private readonly logger = new Logger(PipelinesExecutorService.name);

  constructor(
    @InjectRepository(Pipeline)
    private pipelinesRepository: Repository<Pipeline>,
    @InjectRepository(PipelineRun)
    private runsRepository: Repository<PipelineRun>,
    @InjectRepository(SavedCrossQuery)
    private savedCrossQueryRepository: Repository<SavedCrossQuery>,
    private transformationsExecutorService: TransformationsExecutorService,
    private crossQueryExecutorService: CrossQueryExecutorService,
    private databaseSourceImporter: DatabaseSourceImporterService,
    private schedulerService: PipelinesSchedulerService,
    private moduleRef: ModuleRef,
  ) {}

  private triggerCatalogSync(organizationId: string) {
    setImmediate(async () => {
      try {
        const { CatalogService } = await import('../catalog/catalog.service.js');
        const catalogService = this.moduleRef.get(CatalogService, { strict: false });
        await catalogService.syncPipelines(organizationId);
        await catalogService.syncLineage(organizationId);
      } catch {
        // Catalog not configured or unavailable — ignore
      }
    });
  }

  onModuleInit() {
    // Register executor with scheduler to avoid circular dependency
    this.schedulerService.setExecutor((pipelineId, organizationId, triggerType) =>
      this.run(pipelineId, organizationId, triggerType),
    );
  }

  async run(
    pipelineId: string,
    organizationId: string,
    triggerType: 'manual' | 'scheduled',
  ): Promise<PipelineRun> {
    const pipeline = await this.pipelinesRepository.findOne({
      where: { id: pipelineId, organizationId },
    });
    if (!pipeline) throw new Error(`Pipeline ${pipelineId} not found`);

    const runId = uuidv4();
    const startTime = Date.now();

    // Initialize step results for all steps
    const initialStepResults: Record<string, StepRunResult> = {};
    for (const step of pipeline.definition.steps) {
      initialStepResults[step.id] = { status: 'pending' };
    }

    const run = this.runsRepository.create({
      id: runId,
      pipelineId,
      organizationId,
      triggerType,
      status: 'running',
      stepResults: initialStepResults,
    });
    await this.runsRepository.save(run);

    // Update pipeline lastRunAt
    await this.pipelinesRepository.update({ id: pipelineId }, { lastRunAt: new Date() });

    try {
      const phases = this.topologicalSort(
        pipeline.definition.steps,
        pipeline.definition.edges,
      );

      let anyFailed = false;
      let anySucceeded = false;

      for (const phase of phases) {
        if (anyFailed && pipeline.stopOnError) {
          // Skip remaining phases
          for (const step of phase) {
            await this.updateStepResult(runId, step.id, { status: 'skipped' });
          }
          continue;
        }

        await Promise.all(
          phase.map(async (step) => {
            if (anyFailed && pipeline.stopOnError) {
              await this.updateStepResult(runId, step.id, { status: 'skipped' });
              return;
            }

            await this.updateStepResult(runId, step.id, {
              status: 'running',
              startedAt: new Date().toISOString(),
            });

            try {
              const result = await this.executeStep(step, organizationId);
              await this.updateStepResult(runId, step.id, {
                status: 'success',
                completedAt: new Date().toISOString(),
                rowsProcessed: result.rowsProcessed,
              });
              anySucceeded = true;
            } catch (err: any) {
              this.logger.error(`Step "${step.label}" failed: ${err.message}`);
              await this.updateStepResult(runId, step.id, {
                status: 'failed',
                completedAt: new Date().toISOString(),
                error: err.message,
              });
              anyFailed = true;
            }
          }),
        );
      }

      const finalStatus = anyFailed
        ? anySucceeded
          ? 'partial'
          : 'failed'
        : 'success';

      await this.runsRepository.update(
        { id: runId },
        {
          status: finalStatus,
          completedAt: new Date(),
          executionTimeMs: Date.now() - startTime,
          errorMessage: anyFailed ? 'One or more steps failed' : null,
        },
      );
    } catch (err: any) {
      this.logger.error(`Pipeline run ${runId} crashed: ${err.message}`);
      await this.runsRepository.update(
        { id: runId },
        {
          status: 'failed',
          completedAt: new Date(),
          executionTimeMs: Date.now() - startTime,
          errorMessage: err.message,
        },
      );
    }

    const finalRun = await this.runsRepository.findOne({ where: { id: runId } }) as PipelineRun;
    this.triggerCatalogSync(organizationId);
    return finalRun;
  }

  private async executeStep(
    step: PipelineStep,
    organizationId: string,
  ): Promise<{ rowsProcessed?: number }> {
    switch (step.type) {
      case 'transform': {
        const { transformationId } = step.config as { transformationId: string };
        if (!transformationId) throw new Error('Missing transformationId in step config');
        const result = await this.transformationsExecutorService.execute(
          transformationId,
          'scheduled',
          organizationId,
        );
        return { rowsProcessed: result.rowsProcessed ?? undefined };
      }

      case 'cross-query': {
        const { savedCrossQueryId } = step.config as { savedCrossQueryId: string };
        if (!savedCrossQueryId) throw new Error('Missing savedCrossQueryId in step config');
        const savedQuery = await this.savedCrossQueryRepository.findOne({
          where: { id: savedCrossQueryId },
        });
        if (!savedQuery) throw new Error(`SavedCrossQuery ${savedCrossQueryId} not found`);
        const result = await this.crossQueryExecutorService.executeCrossQuery(
          savedQuery.queryDefinition as any,
          organizationId,
        );
        return { rowsProcessed: result.rowCount };
      }

      case 'ingest': {
        const { sourceConnectionId, sourceSchema, sourceTable, targetStagingName } =
          step.config as {
            sourceConnectionId: string;
            sourceSchema: string;
            sourceTable: string;
            targetStagingName: string;
          };
        if (!sourceConnectionId || !sourceTable)
          throw new Error('Missing ingest config: sourceConnectionId and sourceTable are required');
        const result = await this.databaseSourceImporter.importFromDatabase(
          sourceConnectionId,
          organizationId,
          {
            schema: sourceSchema || 'public',
            table: sourceTable,
            targetTable: targetStagingName || sourceTable,
          },
          `pipeline-step-${step.id}`,
        );
        return { rowsProcessed: result.rowCount };
      }

      case 'export':
        throw new Error('Export steps are not yet supported in pipeline execution');

      default:
        throw new Error(`Unknown step type: ${(step as any).type}`);
    }
  }

  private async updateStepResult(
    runId: string,
    stepId: string,
    update: Partial<StepRunResult>,
  ): Promise<void> {
    const run = await this.runsRepository.findOne({ where: { id: runId } });
    if (!run) return;
    run.stepResults = {
      ...run.stepResults,
      [stepId]: { ...(run.stepResults[stepId] ?? {}), ...update } as StepRunResult,
    };
    await this.runsRepository.save(run);
  }

  /**
   * Topological sort returning phases — groups of steps that can run in parallel.
   * Steps in the same phase have no dependency on each other.
   */
  private topologicalSort(
    steps: PipelineStep[],
    edges: Array<{ id: string; source: string; target: string }>,
  ): PipelineStep[][] {
    if (steps.length === 0) return [];

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, 0);
      adjacency.set(step.id, []);
    }

    for (const edge of edges) {
      if (adjacency.has(edge.source)) {
        adjacency.get(edge.source)!.push(edge.target);
      }
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const phases: PipelineStep[][] = [];
    let remaining = [...steps];

    while (remaining.length > 0) {
      const phase = remaining.filter((s) => inDegree.get(s.id) === 0);
      if (phase.length === 0) break; // cycle — break to avoid infinite loop

      phases.push(phase);
      remaining = remaining.filter((s) => !phase.some((p) => p.id === s.id));

      for (const step of phase) {
        for (const neighborId of adjacency.get(step.id) ?? []) {
          inDegree.set(neighborId, (inDegree.get(neighborId) ?? 0) - 1);
        }
      }
    }

    return phases;
  }
}
