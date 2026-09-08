import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IngestionService } from './ingestion.service';
import { UploadFileDto, ImportJobResponseDto, PreviewResponseDto, ImportFromUrlDto, ImportFromDatabaseDto } from './dto';
import { ImportJobStatus, ImportTargetType } from '../../database/entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { User, UserRole } from '../../database/entities';

// File upload type
interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller('ingestion')
@ApiTags('ingestion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Generate preview of file data (first 100 rows)
   */
  @Post('preview')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Preview file data without importing' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        config: {
          type: 'object',
          example: { delimiter: ',', hasHeader: true },
        },
      },
    },
  })
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async preview(
    @UploadedFile() file: UploadedFileType,
    @CurrentUser() user: User,
    @Body('config') config?: string
  ): Promise<PreviewResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const organizationId = user.organizationId;

    let parsedConfig: Record<string, unknown> | undefined;
    if (config) {
      try {
        parsedConfig = JSON.parse(config);
      } catch {
        throw new BadRequestException('Invalid config JSON');
      }
    }

    return this.ingestionService.generatePreview(
      file,
      organizationId,
      parsedConfig
    );
  }

  /**
   * Start file import job
   */
  @Post('upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload and import file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        targetType: {
          type: 'string',
          enum: ['staging', 'database'],
          example: 'staging',
        },
        targetTable: {
          type: 'string',
          example: 'users',
        },
        connectionId: {
          type: 'string',
          example: 'uuid-of-connection',
        },
        config: {
          type: 'object',
          example: { delimiter: ',', hasHeader: true },
        },
      },
    },
  })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async upload(
    @UploadedFile() file: UploadedFileType,
    @Body('targetType') targetType: string,
    @CurrentUser() user: User,
    @Body('targetTable') targetTable?: string,
    @Body('connectionId') connectionId?: string,
    @Body('config') config?: string
  ): Promise<ImportJobResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!targetType || !['staging', 'database'].includes(targetType)) {
      throw new BadRequestException(
        'targetType must be either "staging" or "database"'
      );
    }

    if (targetType === 'database' && (!connectionId || !targetTable)) {
      throw new BadRequestException(
        'connectionId and targetTable are required for database imports'
      );
    }

    const organizationId = user.organizationId;

    const uploadDto: UploadFileDto = {
      targetType: targetType as ImportTargetType,
      targetTable,
      connectionId,
      config: (() => {
        if (!config) return undefined;
        try {
          return JSON.parse(config);
        } catch {
          throw new BadRequestException('Invalid config JSON');
        }
      })(),
    };

    const importJob = await this.ingestionService.startImport(
      file,
      organizationId,
      uploadDto
    );

    return this.toResponseDto(importJob);
  }

  /**
   * Import file from URL
   */
  @Post('import/url')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Import file from URL' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async importFromUrl(
    @Body() dto: ImportFromUrlDto,
    @CurrentUser() user: User
  ): Promise<ImportJobResponseDto> {
    const organizationId = user.organizationId;

    const uploadDto: UploadFileDto = {
      targetType: dto.targetType || ImportTargetType.STAGING,
      targetTable: dto.targetTable,
      connectionId: dto.connectionId,
      config: dto.config,
    };

    const importJob = await this.ingestionService.importFromUrl(
      dto.url,
      organizationId,
      { ...uploadDto, auth: dto.auth, headers: dto.headers }
    );

    return this.toResponseDto(importJob);
  }

  /**
   * Import data from database connection
   */
  @Post('import/database')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @ApiOperation({ summary: 'Import data from database connection to staging' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async importFromDatabase(
    @Body() dto: ImportFromDatabaseDto,
    @CurrentUser() user: User
  ): Promise<ImportJobResponseDto> {
    const organizationId = user.organizationId;

    const importJob = await this.ingestionService.importFromDatabase(
      dto.connectionId,
      organizationId,
      {
        schema: dto.schema,
        table: dto.table,
        columns: dto.columns,
        whereClause: dto.whereClause,
        rowLimit: dto.rowLimit,
        targetTable: dto.targetTable,
      }
    );

    return this.toResponseDto(importJob);
  }

  /**
   * Get import job status
   */
  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get import job details' })
  async getJob(
    @Param('id') id: string,
    @CurrentUser() user: User
  ): Promise<ImportJobResponseDto> {
    const organizationId = user.organizationId;
    const importJob = await this.ingestionService.getImportJob(
      id,
      organizationId
    );
    return this.toResponseDto(importJob);
  }

  /**
   * List import jobs
   */
  @Get('jobs')
  @ApiOperation({ summary: 'List import jobs' })
  async listJobs(
    @CurrentUser() user: User,
    @Query('status') status?: ImportJobStatus,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ): Promise<{ jobs: ImportJobResponseDto[]; total: number }> {
    const organizationId = user.organizationId;

    const result = await this.ingestionService.listImportJobs(
      organizationId,
      status,
      limit ? parseInt(String(limit)) : 50,
      offset ? parseInt(String(offset)) : 0
    );

    return {
      jobs: result.jobs.map((job) => this.toResponseDto(job)),
      total: result.total,
    };
  }

  /**
   * Delete import job
   */
  @Delete('jobs/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete import job' })
  async deleteJob(
    @Param('id') id: string,
    @CurrentUser() user: User
  ): Promise<void> {
    const organizationId = user.organizationId;
    await this.ingestionService.deleteImportJob(id, organizationId);
  }

  /**
   * List all staged datasets
   */
  @Get('staged')
  @ApiOperation({ summary: 'List all staged datasets' })
  async listStagedData(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ): Promise<{ datasets: any[]; total: number }> {
    const organizationId = user.organizationId;

    const result = await this.ingestionService.listStagedData(
      organizationId,
      limit ? parseInt(String(limit)) : 50,
      offset ? parseInt(String(offset)) : 0
    );

    return result;
  }

  /**
   * Get specific staged dataset
   */
  @Get('staged/:id')
  @ApiOperation({ summary: 'Get staged dataset details including data' })
  async getStagedData(
    @Param('id') id: string,
    @CurrentUser() user: User
  ): Promise<any> {
    const organizationId = user.organizationId;
    return await this.ingestionService.getStagedData(id, organizationId);
  }

  /**
   * Get staged data by import job ID
   */
  @Get('jobs/:id/staged')
  @ApiOperation({ summary: 'Get staged data for a specific import job' })
  async getStagedDataByJobId(
    @Param('id') id: string,
    @CurrentUser() user: User
  ): Promise<any[]> {
    const organizationId = user.organizationId;
    return await this.ingestionService.getStagedDataByJobId(id, organizationId);
  }

  /**
   * Delete staged dataset
   */
  @Delete('staged/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete staged dataset' })
  async deleteStagedData(
    @Param('id') id: string,
    @CurrentUser() user: User
  ): Promise<void> {
    const organizationId = user.organizationId;
    await this.ingestionService.deleteStagedDataById(id, organizationId);
  }

  /**
   * Convert ImportJob entity to response DTO
   */
  private toResponseDto(importJob: any): ImportJobResponseDto {
    return {
      id: importJob.id,
      fileName: importJob.fileName,
      fileSize: importJob.fileSize,
      sourceType: importJob.sourceType,
      targetType: importJob.targetType,
      targetTable: importJob.targetTable,
      connectionId: importJob.connectionId,
      status: importJob.status,
      rowsProcessed: importJob.rowsProcessed,
      rowsSucceeded: importJob.rowsSucceeded,
      rowsFailed: importJob.rowsFailed,
      errors: importJob.errors,
      config: importJob.config,
      createdAt: importJob.createdAt,
      completedAt: importJob.completedAt,
    };
  }
}
