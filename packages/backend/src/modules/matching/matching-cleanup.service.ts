import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MatchProject, MatchRun } from '../../database/entities';
import { MaterializeService } from './materialize.service';

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
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    this.logger.log(
      `Starting cleanup of match workspaces older than ${cutoffDate.toISOString()}`,
    );

    const projects = await this.projectsRepository.find();
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
        await this.cleanupProject(project);
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
  }

  private async cleanupProject(project: MatchProject): Promise<void> {
    // Drop left and right workspace tables
    const leftTable = this.materializeService.workspaceTable(project.id, 'left');
    const rightTable = this.materializeService.workspaceTable(project.id, 'right');

    // Get all runs for this project to build delete query for candidates
    const runs = await this.runsRepository.find({
      where: { projectId: project.id },
    });

    const runIds = runs.map((run) => run.id);

    // Drop workspace tables (if they exist)
    await this.dataSource.query(`DROP TABLE IF EXISTS ${leftTable}`);
    await this.dataSource.query(`DROP TABLE IF EXISTS ${rightTable}`);

    // Delete match_candidates rows for this project's runs
    if (runIds.length > 0) {
      const placeholders = runIds.map((_, i) => `$${i + 1}`).join(',');
      await this.dataSource.query(
        `DELETE FROM "match_candidates" WHERE run_id IN (${placeholders})`,
        runIds,
      );
    }
  }
}
