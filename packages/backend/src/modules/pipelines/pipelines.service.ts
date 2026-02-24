import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Pipeline, PipelineRun } from '../../database/entities';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { PipelinesSchedulerService } from './pipelines-scheduler.service';

@Injectable()
export class PipelinesService {
  constructor(
    @InjectRepository(Pipeline)
    private pipelinesRepository: Repository<Pipeline>,
    @InjectRepository(PipelineRun)
    private runsRepository: Repository<PipelineRun>,
    private scheduler: PipelinesSchedulerService,
  ) {}

  async create(
    dto: CreatePipelineDto,
    organizationId: string,
    userId: string,
  ): Promise<Pipeline> {
    const pipeline = this.pipelinesRepository.create({
      id: uuidv4(),
      name: dto.name,
      description: dto.description ?? '',
      organizationId,
      createdBy: userId,
      schedule: dto.schedule ?? null,
      status: 'active',
      stopOnError: dto.stopOnError ?? true,
      definition: { steps: [], edges: [] },
      lastRunAt: null,
    });

    const saved = await this.pipelinesRepository.save(pipeline);

    if (saved.schedule && saved.status === 'active') {
      this.scheduler.scheduleJob(saved);
    }

    return saved;
  }

  async findAll(organizationId: string): Promise<Pipeline[]> {
    return this.pipelinesRepository
      .createQueryBuilder('p')
      .select([
        'p.id',
        'p.name',
        'p.description',
        'p.schedule',
        'p.status',
        'p.stopOnError',
        'p.lastRunAt',
        'p.createdAt',
        'p.updatedAt',
        'p.organizationId',
        'p.createdBy',
      ])
      .where('p.organizationId = :organizationId', { organizationId })
      .orderBy('p.updatedAt', 'DESC')
      .getMany();
  }

  async findOne(id: string, organizationId: string): Promise<Pipeline> {
    const pipeline = await this.pipelinesRepository.findOne({
      where: { id, organizationId },
    });
    if (!pipeline) throw new NotFoundException(`Pipeline ${id} not found`);
    return pipeline;
  }

  async update(
    id: string,
    organizationId: string,
    dto: UpdatePipelineDto,
  ): Promise<Pipeline> {
    const pipeline = await this.findOne(id, organizationId);
    const oldSchedule = pipeline.schedule;
    const oldStatus = pipeline.status;

    if (dto.name !== undefined) pipeline.name = dto.name;
    if (dto.description !== undefined) pipeline.description = dto.description;
    if (dto.schedule !== undefined) pipeline.schedule = dto.schedule;
    if (dto.stopOnError !== undefined) pipeline.stopOnError = dto.stopOnError;
    if (dto.status !== undefined) pipeline.status = dto.status;
    if (dto.definition !== undefined) pipeline.definition = dto.definition as any;

    const saved = await this.pipelinesRepository.save(pipeline);

    const scheduleChanged = oldSchedule !== saved.schedule;
    const statusChanged = oldStatus !== saved.status;

    if (scheduleChanged || statusChanged) {
      this.scheduler.unscheduleJob(saved.id);
      if (saved.schedule && saved.status === 'active') {
        this.scheduler.scheduleJob(saved);
      }
    }

    return saved;
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const pipeline = await this.findOne(id, organizationId);
    this.scheduler.unscheduleJob(pipeline.id);
    await this.pipelinesRepository.delete({ id, organizationId });
  }

  async getRuns(
    pipelineId: string,
    organizationId: string,
    limit = 20,
  ): Promise<PipelineRun[]> {
    await this.findOne(pipelineId, organizationId);
    return this.runsRepository.find({
      where: { pipelineId, organizationId },
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async getRun(
    pipelineId: string,
    runId: string,
    organizationId: string,
  ): Promise<PipelineRun> {
    await this.findOne(pipelineId, organizationId);
    const run = await this.runsRepository.findOne({
      where: { id: runId, pipelineId, organizationId },
    });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return run;
  }
}
