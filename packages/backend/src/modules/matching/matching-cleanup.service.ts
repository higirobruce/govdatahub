import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MatchProject, MatchRun } from '../../database/entities';
import { MaterializeService } from './materialize.service';

/** PostgreSQL's maximum bound parameters per statement — per protocol limit. */
const PG_MAX_BOUND_PARAMS = 65535;

@Injectable()
export class MatchingCleanupService {
  private readonly logger = new Logger(MatchingCleanupService.name);
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(MatchProject)
    private projectsRepository: Repository<MatchProject>,
    @InjectRepository(MatchRun)
    private runsRepository: Repository<MatchRun>,
    private dataSource: DataSource,
    private materializeService: MaterializeService,
    private configService: ConfigService,
  ) {
    this.retentionDays = this.configService.get<number>(
      'MATCHING_RETENTION_DAYS',
      30,
    );

    this.logger.log(
      `Matching cleanup service initialized with ${this.retentionDays} days retention`,
    );
  }

  @Cron('0 3 * * *') // Daily at 3 AM
  async cleanupExpiredWorkspaces(): Promise<{ projectsSwept: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      this.logger.log(
        `Starting cleanup of match workspaces older than ${cutoffDate.toISOString()}`,
      );

      let projects: MatchProject[];
      try {
        projects = await this.projectsRepository.find();
      } catch (error) {
        this.logger.error(
          `Failed to fetch projects for cleanup: ${error.message}`,
          error.stack,
        );
        return { projectsSwept: 0 };
      }

      let projectsSwept = 0;

      for (const project of projects) {
        try {
          // Check if project has any runs
          const runs = await this.runsRepository.find({
            where: { projectId: project.id },
          });

          // If no runs, skip this project
          if (runs.length === 0) {
            continue;
          }

          // Check if any run is within retention window
          const hasRecentRun = runs.some((run) => run.startedAt >= cutoffDate);
          if (hasRecentRun) {
            // At least one run is within retention window, skip this project
            continue;
          }

          // All runs are expired, proceed with cleanup
          await this.cleanupProject(project, runs);
          projectsSwept++;
        } catch (error) {
          this.logger.warn(
            `Cleanup failed for project ${project.id}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(`Successfully cleaned up ${projectsSwept} expired match workspaces`);
      return { projectsSwept };
    } catch (error) {
      this.logger.error(
        `Unexpected error in cleanup service: ${error.message}`,
        error.stack,
      );
      return { projectsSwept: 0 };
    }
  }

  private async cleanupProject(project: MatchProject, runs: MatchRun[]): Promise<void> {
    // Drop left and right workspace tables
    const leftTable = this.materializeService.workspaceTable(project.id, 'left');
    const rightTable = this.materializeService.workspaceTable(project.id, 'right');

    const runIds = runs.map((run) => run.id);

    // Drop workspace tables (if they exist)
    await this.dataSource.query(`DROP TABLE IF EXISTS ${leftTable}`);
    await this.dataSource.query(`DROP TABLE IF EXISTS ${rightTable}`);

    // Delete match_candidates rows for this project's runs, chunked against
    // PostgreSQL's 65535 bound-parameter limit. Each chunk deletes one or more
    // run IDs, so we chunk by count of run IDs (one parameter per ID).
    if (runIds.length > 0) {
      const maxRunIdsPerStatement = Math.max(1, Math.floor(PG_MAX_BOUND_PARAMS));

      for (let offset = 0; offset < runIds.length; offset += maxRunIdsPerStatement) {
        const chunk = runIds.slice(offset, offset + maxRunIdsPerStatement);
        const placeholders = chunk.map((_, i) => `$${i + 1}`).join(',');
        await this.dataSource.query(
          `DELETE FROM "match_candidates" WHERE run_id IN (${placeholders})`,
          chunk,
        );
      }
    }
  }
}
