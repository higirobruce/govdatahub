import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TransformationRun, CachedResult } from '../../database/entities';

@Injectable()
export class TransformationsCleanupService {
  private readonly logger = new Logger(TransformationsCleanupService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(TransformationRun)
    private runsRepository: Repository<TransformationRun>,
    @InjectRepository(CachedResult)
    private cachedResultRepository: Repository<CachedResult>,
    private configService: ConfigService,
  ) {
    this.retentionDays = this.configService.get<number>(
      'TRANSFORMATION_RETENTION_DAYS',
      90,
    );

    this.logger.log(
      `Cleanup service initialized with ${this.retentionDays} days retention`,
    );
  }

  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupOldRuns() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    this.logger.log(
      `Starting cleanup of transformation runs older than ${cutoffDate.toISOString()}`,
    );

    try {
      // Get IDs of runs to delete
      const oldRuns = await this.runsRepository.find({
        where: {
          startedAt: LessThan(cutoffDate),
        },
        select: ['id'],
      });

      if (oldRuns.length === 0) {
        this.logger.log('No old runs to clean up');
        return;
      }

      const runIds = oldRuns.map((run) => run.id);

      // Delete associated cached results first
      const cachedResultsDeleted = await this.cachedResultRepository
        .createQueryBuilder()
        .delete()
        .where('query_id IN (:...runIds)', { runIds })
        .execute();

      this.logger.log(
        `Deleted ${cachedResultsDeleted.affected} cached results`,
      );

      // Delete old runs
      const runsDeleted = await this.runsRepository
        .createQueryBuilder()
        .delete()
        .where('started_at < :cutoffDate', { cutoffDate })
        .execute();

      this.logger.log(
        `Successfully cleaned up ${runsDeleted.affected} transformation runs older than ${this.retentionDays} days`,
      );
    } catch (error) {
      this.logger.error(
        `Cleanup failed: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Manual cleanup trigger for testing or administrative purposes
   */
  async triggerCleanup(): Promise<{
    runsDeleted: number;
    cachedResultsDeleted: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    // Get IDs of runs to delete
    const oldRuns = await this.runsRepository.find({
      where: {
        startedAt: LessThan(cutoffDate),
      },
      select: ['id'],
    });

    if (oldRuns.length === 0) {
      return { runsDeleted: 0, cachedResultsDeleted: 0 };
    }

    const runIds = oldRuns.map((run) => run.id);

    // Delete cached results
    const cachedResultsDeleted = await this.cachedResultRepository
      .createQueryBuilder()
      .delete()
      .where('query_id IN (:...runIds)', { runIds })
      .execute();

    // Delete runs
    const runsDeleted = await this.runsRepository
      .createQueryBuilder()
      .delete()
      .where('started_at < :cutoffDate', { cutoffDate })
      .execute();

    return {
      runsDeleted: runsDeleted.affected || 0,
      cachedResultsDeleted: cachedResultsDeleted.affected || 0,
    };
  }
}
