import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  Transformation,
  TransformationRun,
  CachedResult,
} from '../../database/entities';
import { EncryptionService } from '../encryption/encryption.service';
import { ConnectionsService } from '../connections/connections.service';
import { CreateTransformationDto } from './dto/create-transformation.dto';
import { UpdateTransformationDto } from './dto/update-transformation.dto';
import { TransformationResponseDto } from './dto/transformation-response.dto';
import { TransformationRunResponseDto } from './dto/transformation-run-response.dto';
import { OutputConfigDto } from './dto/output-config.dto';

@Injectable()
export class TransformationsService {
  constructor(
    @InjectRepository(Transformation)
    private transformationsRepository: Repository<Transformation>,
    @InjectRepository(TransformationRun)
    private runsRepository: Repository<TransformationRun>,
    @InjectRepository(CachedResult)
    private cachedResultRepository: Repository<CachedResult>,
    private encryptionService: EncryptionService,
    private connectionsService: ConnectionsService,
  ) {}

  async create(
    createDto: CreateTransformationDto,
    organizationId: string,
  ): Promise<TransformationResponseDto> {
    // Validate that source connection exists and belongs to organization
    await this.connectionsService.findOne(createDto.sourceConnectionId, organizationId);

    // Prepare output config with defaults
    const outputConfig: OutputConfigDto = createDto.outputConfig || {
      mode: 'cache',
    };

    // Encrypt output config
    const encryptedConfig = this.encryptionService.encryptObject(outputConfig);

    // Create transformation
    const transformation = this.transformationsRepository.create({
      id: uuidv4(),
      name: createDto.name,
      description: createDto.description,
      sourceConnectionId: createDto.sourceConnectionId,
      organizationId,
      sqlQuery: createDto.sqlQuery,
      outputConfig: encryptedConfig,
      status: 'active',
    });

    const saved = await this.transformationsRepository.save(transformation);

    return this.toResponseDto(saved, outputConfig);
  }

  async findAll(
    organizationId: string,
    filters?: {
      status?: string;
    },
  ): Promise<TransformationResponseDto[]> {
    const query = this.transformationsRepository.createQueryBuilder('t');

    query.where('t.organization_id = :organizationId', { organizationId });

    if (filters?.status) {
      query.andWhere('t.status = :status', { status: filters.status });
    }

    query.orderBy('t.created_at', 'DESC');

    const transformations = await query.getMany();

    return transformations.map((t) => {
      const outputConfig =
        this.encryptionService.decryptObject<OutputConfigDto>(t.outputConfig);
      return this.toResponseDto(t, outputConfig);
    });
  }

  async findOne(id: string, organizationId: string): Promise<TransformationResponseDto> {
    const transformation = await this.transformationsRepository.findOne({
      where: { id, organizationId },
    });

    if (!transformation) {
      throw new NotFoundException(`Transformation with ID ${id} not found`);
    }

    const outputConfig =
      this.encryptionService.decryptObject<OutputConfigDto>(
        transformation.outputConfig,
      );

    return this.toResponseDto(transformation, outputConfig);
  }

  async update(
    id: string,
    organizationId: string,
    updateDto: UpdateTransformationDto,
  ): Promise<TransformationResponseDto> {
    const transformation = await this.transformationsRepository.findOne({
      where: { id, organizationId },
    });

    if (!transformation) {
      throw new NotFoundException(`Transformation with ID ${id} not found`);
    }

    // Validate source connection if changed
    if (
      updateDto.sourceConnectionId &&
      updateDto.sourceConnectionId !== transformation.sourceConnectionId
    ) {
      await this.connectionsService.findOne(updateDto.sourceConnectionId, organizationId);
    }

    // Update output config if provided
    let encryptedConfig = transformation.outputConfig;
    let outputConfig =
      this.encryptionService.decryptObject<OutputConfigDto>(encryptedConfig);

    if (updateDto.outputConfig) {
      outputConfig = updateDto.outputConfig;
      encryptedConfig = this.encryptionService.encryptObject(outputConfig);
    }

    // Update fields
    if (updateDto.name) transformation.name = updateDto.name;
    if (updateDto.description)
      transformation.description = updateDto.description;
    if (updateDto.sourceConnectionId)
      transformation.sourceConnectionId = updateDto.sourceConnectionId;
    if (updateDto.sqlQuery) transformation.sqlQuery = updateDto.sqlQuery;
    if (updateDto.outputConfig) transformation.outputConfig = encryptedConfig;

    const updated = await this.transformationsRepository.save(transformation);

    return this.toResponseDto(updated, outputConfig);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.transformationsRepository.delete({ id, organizationId });

    if (result.affected === 0) {
      throw new NotFoundException(`Transformation with ID ${id} not found`);
    }
  }

  async pause(id: string, organizationId: string): Promise<void> {
    const transformation = await this.transformationsRepository.findOne({
      where: { id, organizationId },
    });

    if (!transformation) {
      throw new NotFoundException(`Transformation with ID ${id} not found`);
    }

    transformation.status = 'paused';
    await this.transformationsRepository.save(transformation);
  }

  async resume(id: string, organizationId: string): Promise<void> {
    const transformation = await this.transformationsRepository.findOne({
      where: { id, organizationId },
    });

    if (!transformation) {
      throw new NotFoundException(`Transformation with ID ${id} not found`);
    }

    transformation.status = 'active';
    await this.transformationsRepository.save(transformation);
  }

  async getRuns(
    transformationId: string,
    organizationId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<TransformationRunResponseDto[]> {
    // Verify transformation exists and belongs to organization
    await this.findOne(transformationId, organizationId);

    const runs = await this.runsRepository.find({
      where: { transformationId, organizationId },
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    // Get transformation name
    const transformation = await this.transformationsRepository.findOne({
      where: { id: transformationId, organizationId },
    });

    return runs.map((run) => this.toRunResponseDto(run, transformation?.name));
  }

  async getRunDetails(runId: string, organizationId: string): Promise<TransformationRunResponseDto> {
    const run = await this.runsRepository.findOne({
      where: { id: runId, organizationId },
    });

    if (!run) {
      throw new NotFoundException(`Run with ID ${runId} not found`);
    }

    // Get transformation name
    const transformation = await this.transformationsRepository.findOne({
      where: { id: run.transformationId, organizationId },
    });

    return this.toRunResponseDto(run, transformation?.name);
  }

  async getRunResults(runId: string, organizationId: string): Promise<any> {
    const cachedResult = await this.cachedResultRepository.findOne({
      where: { queryId: runId, organizationId },
    });

    if (!cachedResult) {
      throw new NotFoundException(`No cached results found for run ${runId}`);
    }

    return JSON.parse(cachedResult.results);
  }

  async validateSql(
    sqlQuery: string,
  ): Promise<{ valid: boolean; error?: string }> {
    // SQL validation is handled by @IsSafeSql() decorator
    // This method can be extended with additional validation logic
    if (!sqlQuery || sqlQuery.trim().length === 0) {
      return { valid: false, error: 'SQL query cannot be empty' };
    }

    return { valid: true };
  }

  private toResponseDto(
    transformation: Transformation,
    outputConfig: OutputConfigDto,
  ): TransformationResponseDto {
    return {
      id: transformation.id,
      name: transformation.name,
      description: transformation.description,
      sourceConnectionId: transformation.sourceConnectionId,
      sqlQuery: transformation.sqlQuery,
      outputConfig,
      status: transformation.status,
      createdAt: transformation.createdAt,
      lastRunAt: transformation.lastRunAt || null,
    };
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
