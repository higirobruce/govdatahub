import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  Transformation,
  TransformationRun,
  CachedResult,
} from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { EncryptionService } from '../encryption/encryption.service';
import { TransformationRunResponseDto } from './dto/transformation-run-response.dto';
import { OutputConfigDto } from './dto/output-config.dto';

@Injectable()
export class TransformationsExecutorService {
  private readonly transformationTimeout: number;

  constructor(
    @InjectRepository(Transformation)
    private transformationsRepository: Repository<Transformation>,
    @InjectRepository(TransformationRun)
    private runsRepository: Repository<TransformationRun>,
    @InjectRepository(CachedResult)
    private cachedResultRepository: Repository<CachedResult>,
    private connectionsService: ConnectionsService,
    private encryptionService: EncryptionService,
    private configService: ConfigService,
  ) {
    this.transformationTimeout = this.configService.get<number>(
      'TRANSFORMATION_TIMEOUT_MS',
      300000,
    ); // 5 minutes default
  }

  async execute(
    transformationId: string,
    triggerType: 'manual' | 'scheduled',
    organizationId: string,
  ): Promise<TransformationRunResponseDto> {
    const runId = uuidv4();
    const startTime = Date.now();

    // 1. Load transformation
    const transformation = await this.loadTransformation(transformationId, organizationId);

    // 2. Validate transformation is not paused
    if (transformation.status === 'paused') {
      throw new BadRequestException('Cannot execute paused transformation');
    }

    // 3. Create run record with 'running' status
    const run = await this.createRunRecord(runId, transformationId, transformation.organizationId, triggerType);

    try {
      // 4. Get database driver (validates organizationId)
      const driver = await this.connectionsService.getDriver(
        transformation.sourceConnectionId,
        transformation.organizationId,
      );

      try {
        // 5. Execute SQL with timeout protection
        const outputConfig =
          this.encryptionService.decryptObject<OutputConfigDto>(
            transformation.outputConfig,
          );
        const maxRows =
          outputConfig.maxRows ||
          this.configService.get<number>('MAX_RESULT_ROWS', 10000);

        const result = await this.executeWithTimeout(
          driver.query(transformation.sqlQuery),
          this.transformationTimeout,
        );

        // 6. Limit rows if needed
        if (result.rows.length > maxRows) {
          result.rows = result.rows.slice(0, maxRows);
        }

        // 7. Cache results
        await this.cacheResults(runId, transformation.organizationId, result);

        // 8. Update run record with success
        const executionTime = Date.now() - startTime;
        await this.completeRun(run, {
          status: 'success',
          executionTimeMs: executionTime,
          rowsProcessed: result.rowCount,
        });

        // 9. Update transformation.lastRunAt
        await this.updateLastRunAt(transformationId);

        return this.toRunResponseDto(run, transformation.name);
      } finally {
        // Always disconnect driver
        await driver.disconnect();
      }
    } catch (error) {
      // Handle execution failure
      const executionTime = Date.now() - startTime;
      const status = error.message.includes('timeout') ? 'timeout' : 'failed';

      await this.completeRun(run, {
        status,
        executionTimeMs: executionTime,
        errorMessage: error.message,
      });

      throw new BadRequestException(
        `Transformation execution failed: ${error.message}`,
      );
    }
  }

  private async loadTransformation(
    id: string,
    organizationId: string,
  ): Promise<Transformation> {
    const transformation = await this.transformationsRepository.findOne({
      where: { id, organizationId },
    });

    if (!transformation) {
      throw new BadRequestException(`Transformation with ID ${id} not found`);
    }

    return transformation;
  }

  private async createRunRecord(
    runId: string,
    transformationId: string,
    organizationId: string,
    triggerType: 'manual' | 'scheduled',
  ): Promise<TransformationRun> {
    const run = this.runsRepository.create({
      id: runId,
      transformationId,
      organizationId,
      triggerType: triggerType as 'manual' | 'scheduled',
      status: 'running' as 'running' | 'success' | 'failed' | 'timeout',
    });

    return await this.runsRepository.save(run);
  }

  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Transformation timeout exceeded')),
        timeoutMs,
      );
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private async cacheResults(runId: string, organizationId: string, result: any): Promise<void> {
    const cachedResult = this.cachedResultRepository.create({
      id: uuidv4(),
      queryId: runId, // Use runId as queryId for consistency
      organizationId,
      results: JSON.stringify(result),
    });

    await this.cachedResultRepository.save(cachedResult);
  }

  private async completeRun(
    run: TransformationRun,
    updates: {
      status: 'running' | 'success' | 'failed' | 'timeout';
      executionTimeMs: number;
      rowsProcessed?: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    run.status = updates.status;
    run.completedAt = new Date();
    run.executionTimeMs = updates.executionTimeMs;
    run.rowsProcessed = updates.rowsProcessed || 0;
    run.errorMessage = updates.errorMessage || null;

    await this.runsRepository.save(run);
  }

  private async updateLastRunAt(transformationId: string): Promise<void> {
    await this.transformationsRepository.update(transformationId, {
      lastRunAt: new Date(),
    });
  }

  private toRunResponseDto(
    run: TransformationRun,
    transformationName?: string,
  ): TransformationRunResponseDto {
    return {
      id: run.id,
      transformationId: run.transformationId,
      transformationName,
      triggerType: run.triggerType,
      startedAt: run.startedAt,
      completedAt: run.completedAt || null,
      executionTimeMs: run.executionTimeMs || null,
      rowsProcessed: run.rowsProcessed || null,
      status: run.status,
      errorMessage: run.errorMessage || null,
    };
  }
}
