import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Pipeline } from '../../database/entities';

@Injectable()
export class PipelinesSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PipelinesSchedulerService.name);
  private executor: ((pipelineId: string, organizationId: string, triggerType: 'scheduled') => Promise<any>) | null = null;

  constructor(
    @InjectRepository(Pipeline)
    private pipelinesRepository: Repository<Pipeline>,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Called by PipelinesExecutorService after initialization to avoid circular deps.
   */
  setExecutor(fn: (pipelineId: string, organizationId: string, triggerType: 'scheduled') => Promise<any>) {
    this.executor = fn;
  }

  async onModuleInit() {
    const pipelines = await this.pipelinesRepository.find({
      where: { status: 'active' },
      select: ['id', 'name', 'schedule', 'organizationId', 'status'],
    });

    let scheduled = 0;
    for (const pipeline of pipelines) {
      if (pipeline.schedule) {
        this.scheduleJob(pipeline);
        scheduled++;
      }
    }
    this.logger.log(`Registered ${scheduled} pipeline cron job(s) on startup`);
  }

  scheduleJob(pipeline: Pipeline) {
    const jobName = `pipeline_${pipeline.id}`;
    this.unscheduleJob(pipeline.id);

    if (!pipeline.schedule) return;

    try {
      const job = new CronJob(pipeline.schedule, async () => {
        this.logger.log(`Scheduled trigger for pipeline "${pipeline.name}" (${pipeline.id})`);
        if (!this.executor) {
          this.logger.warn(`No executor set — skipping pipeline run for ${pipeline.id}`);
          return;
        }
        try {
          await this.executor(pipeline.id, pipeline.organizationId, 'scheduled');
        } catch (err: any) {
          this.logger.error(`Scheduled run failed for pipeline ${pipeline.id}: ${err.message}`);
        }
      });

      this.schedulerRegistry.addCronJob(jobName, job as any);
      job.start();
      this.logger.log(`Scheduled pipeline "${pipeline.name}" — cron: ${pipeline.schedule}`);
    } catch (err: any) {
      this.logger.error(`Failed to schedule pipeline ${pipeline.id}: ${err.message}`);
    }
  }

  unscheduleJob(pipelineId: string) {
    const jobName = `pipeline_${pipelineId}`;
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch {
      // job may not exist — that's fine
    }
  }
}
