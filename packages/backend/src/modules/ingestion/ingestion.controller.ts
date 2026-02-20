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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IngestionService } from './ingestion.service';
import { UploadFileDto, ImportJobResponseDto, PreviewResponseDto, ImportFromUrlDto, ImportFromDatabaseDto } from './dto';
import { ImportJobStatus, ImportTargetType } from '../../database/entities';

// Note: Replace with actual auth guards when authentication is implemented
// For now, using a placeholder decorator
const CurrentUser = () => {
  return (target: any, propertyKey: string, parameterIndex: number) => {
    // Placeholder - will be replaced with actual implementation
  };
};

interface User {
  id: string;
  organizationId: string;
}

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
@UseGuards(ThrottlerGuard)
@ApiTags('ingestion')
@ApiBearerAuth()
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Generate preview of file data (first 100 rows)
   */
  @Post('preview')
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
    @Body('config') config?: string,
    @CurrentUser() user?: User
  ): Promise<PreviewResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // For now, use a default organization ID until auth is implemented
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';

    const parsedConfig = config ? JSON.parse(config) : undefined;

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
    @Body('targetTable') targetTable?: string,
    @Body('connectionId') connectionId?: string,
    @Body('config') config?: string,
    @CurrentUser() user?: User
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

    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';

    const uploadDto: UploadFileDto = {
      targetType: targetType as ImportTargetType,
      targetTable,
      connectionId,
      config: config ? JSON.parse(config) : undefined,
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
  @ApiOperation({ summary: 'Import file from URL' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async importFromUrl(
    @Body() dto: ImportFromUrlDto,
    @CurrentUser() user?: User
  ): Promise<ImportJobResponseDto> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';

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
  @ApiOperation({ summary: 'Import data from database connection to staging' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async importFromDatabase(
    @Body() dto: ImportFromDatabaseDto,
    @CurrentUser() user?: User
  ): Promise<ImportJobResponseDto> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';

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
    @CurrentUser() user?: User
  ): Promise<ImportJobResponseDto> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';
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
    @Query('status') status?: ImportJobStatus,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @CurrentUser() user?: User
  ): Promise<{ jobs: ImportJobResponseDto[]; total: number }> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';

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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete import job' })
  async deleteJob(
    @Param('id') id: string,
    @CurrentUser() user?: User
  ): Promise<void> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';
    await this.ingestionService.deleteImportJob(id, organizationId);
  }

  /**
   * List all staged datasets
   */
  @Get('staged')
  @ApiOperation({ summary: 'List all staged datasets' })
  async listStagedData(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @CurrentUser() user?: User
  ): Promise<{ datasets: any[]; total: number }> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';

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
    @CurrentUser() user?: User
  ): Promise<any> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';
    return await this.ingestionService.getStagedData(id, organizationId);
  }

  /**
   * Get staged data by import job ID
   */
  @Get('jobs/:id/staged')
  @ApiOperation({ summary: 'Get staged data for a specific import job' })
  async getStagedDataByJobId(
    @Param('id') id: string,
    @CurrentUser() user?: User
  ): Promise<any[]> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';
    return await this.ingestionService.getStagedDataByJobId(id, organizationId);
  }

  /**
   * Delete staged dataset
   */
  @Delete('staged/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete staged dataset' })
  async deleteStagedData(
    @Param('id') id: string,
    @CurrentUser() user?: User
  ): Promise<void> {
    const organizationId = user?.organizationId || '8498b154-4864-433b-8573-93ae7d2ee200';
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
