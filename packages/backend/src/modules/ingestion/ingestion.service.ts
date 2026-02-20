import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ImportJob,
  ImportJobStatus,
  ImportSourceType,
  ImportTargetType,
  StagedData,
} from '../../database/entities';
import { CsvParserService } from './parsers/csv-parser.service';
import { ExcelParserService } from './parsers/excel-parser.service';
import { JsonParserService } from './parsers/json-parser.service';
import { StagingImporterService } from './importers/staging-importer.service';
import { DatabaseImporterService } from './importers/database-importer.service';
import { UrlImporterService, UrlImportConfig } from './importers/url-importer.service';
import { DatabaseSourceImporterService, DatabaseImportConfig } from './importers/database-source-importer.service';
import { v4 as uuidv4 } from 'uuid';
import { PreviewResponseDto, UploadFileDto } from './dto';

// File upload type
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(ImportJob)
    private readonly importJobRepository: Repository<ImportJob>,
    @InjectRepository(StagedData)
    private readonly stagedDataRepository: Repository<StagedData>,
    private readonly csvParser: CsvParserService,
    private readonly excelParser: ExcelParserService,
    private readonly jsonParser: JsonParserService,
    private readonly stagingImporter: StagingImporterService,
    private readonly databaseImporter: DatabaseImporterService,
    private readonly urlImporter: UrlImporterService,
    private readonly databaseSourceImporter: DatabaseSourceImporterService,
  ) {}

  /**
   * Generate preview of file data without importing
   */
  async generatePreview(
    file: UploadedFile,
    organizationId: string,
    config?: Record<string, any>
  ): Promise<PreviewResponseDto> {
    const sourceType = this.detectSourceType(file.originalname);

    this.logger.log(
      `Generating preview for ${file.originalname} (${sourceType})`
    );

    let parsedData;

    switch (sourceType) {
      case 'csv':
        parsedData = await this.csvParser.parsePreview(file.buffer, config);
        break;

      case 'excel':
        parsedData = await this.excelParser.parsePreview(file.buffer, config);
        break;

      case 'json':
        parsedData = await this.jsonParser.parsePreview(file.buffer, config);
        break;

      default:
        throw new BadRequestException(
          `Unsupported file type: ${sourceType}`
        );
    }

    return parsedData;
  }

  /**
   * Start import job (async processing)
   */
  async startImport(
    file: UploadedFile,
    organizationId: string,
    uploadDto: UploadFileDto
  ): Promise<ImportJob> {
    const sourceType = this.detectSourceType(file.originalname);
    const importJobId = uuidv4();

    // Create import job record
    const importJob = this.importJobRepository.create({
      id: importJobId,
      organizationId,
      fileName: file.originalname,
      fileSize: file.size,
      sourceType,
      targetType: uploadDto.targetType,
      targetTable: uploadDto.targetTable,
      connectionId: uploadDto.connectionId,
      status: ImportJobStatus.PENDING,
      rowsProcessed: 0,
      rowsSucceeded: 0,
      rowsFailed: 0,
      errors: [],
      config: uploadDto.config,
    });

    await this.importJobRepository.save(importJob);

    this.logger.log(`Created import job ${importJobId}`);

    // Start async processing (don't await)
    this.processImport(importJobId, file.buffer, organizationId, uploadDto).catch(
      (error) => {
        this.logger.error(
          `Import job ${importJobId} failed: ${error.message}`,
          error.stack
        );
      }
    );

    return importJob;
  }

  /**
   * Process import job asynchronously
   */
  private async processImport(
    importJobId: string,
    fileBuffer: Buffer,
    organizationId: string,
    uploadDto: UploadFileDto
  ): Promise<void> {
    const importJob = await this.importJobRepository.findOne({
      where: { id: importJobId },
    });

    if (!importJob) {
      throw new NotFoundException('Import job not found');
    }

    try {
      // Update status to processing
      importJob.status = ImportJobStatus.PROCESSING;
      await this.importJobRepository.save(importJob);

      let totalRows = 0;
      let totalErrors = 0;
      const allErrors: any[] = [];

      // Chunk handler for streaming processing
      const handleChunk = async (
        chunk: Record<string, any>[],
        chunkErrors: any[]
      ) => {
        // Store errors
        if (chunkErrors.length > 0) {
          allErrors.push(...chunkErrors);
        }

        // Import to staging or database
        if (uploadDto.targetType === 'staging') {
          const schema = this.extractSchema(chunk);
          await this.stagingImporter.importToStaging(
            organizationId,
            importJobId,
            uploadDto.targetTable || importJob.fileName,
            schema,
            chunk
          );
        } else if (uploadDto.targetType === 'database') {
          if (!uploadDto.connectionId || !uploadDto.targetTable) {
            throw new BadRequestException(
              'Connection ID and target table required for database import'
            );
          }

          const schema = this.extractSchema(chunk);
          const result = await this.databaseImporter.importToDatabase(
            uploadDto.connectionId,
            organizationId,
            uploadDto.targetTable,
            schema,
            chunk
          );

          // Accumulate errors from database import
          if (result.errors.length > 0) {
            allErrors.push(...result.errors);
          }

          importJob.rowsSucceeded += result.rowsSucceeded;
          importJob.rowsFailed += result.rowsFailed;
        }

        // Update progress
        importJob.rowsProcessed += chunk.length;
        await this.importJobRepository.save(importJob);
      };

      // Parse with chunking
      switch (importJob.sourceType) {
        case 'csv':
          const csvResult = await this.csvParser.parseWithChunking(
            fileBuffer,
            uploadDto.config,
            handleChunk
          );
          totalRows = csvResult.totalRows;
          totalErrors = csvResult.totalErrors;
          break;

        case 'excel':
          const excelResult = await this.excelParser.parseWithChunking(
            fileBuffer,
            uploadDto.config,
            handleChunk
          );
          totalRows = excelResult.totalRows;
          totalErrors = excelResult.totalErrors;
          break;

        case 'json':
          const jsonResult = await this.jsonParser.parseWithChunking(
            fileBuffer,
            uploadDto.config,
            handleChunk
          );
          totalRows = jsonResult.totalRows;
          totalErrors = jsonResult.totalErrors;
          break;

        default:
          throw new BadRequestException(
            `Unsupported source type: ${importJob.sourceType}`
          );
      }

      // Update job status to completed
      importJob.status = ImportJobStatus.COMPLETED;
      importJob.rowsProcessed = totalRows;
      importJob.rowsFailed = allErrors.length;
      importJob.rowsSucceeded = totalRows - allErrors.length;
      importJob.errors = allErrors.slice(0, 1000); // Store first 1000 errors
      importJob.completedAt = new Date();

      await this.importJobRepository.save(importJob);

      this.logger.log(
        `Import job ${importJobId} completed: ${importJob.rowsSucceeded} succeeded, ${importJob.rowsFailed} failed`
      );
    } catch (error) {
      // Update job status to failed
      importJob.status = ImportJobStatus.FAILED;
      importJob.errors = [
        {
          row: 0,
          column: '*',
          value: null,
          error: error.message || String(error),
          type: 'SYSTEM_ERROR',
          severity: 'error',
        },
      ];
      await this.importJobRepository.save(importJob);

      throw error;
    }
  }

  /**
   * Get import job by ID
   */
  async getImportJob(
    importJobId: string,
    organizationId: string
  ): Promise<ImportJob> {
    const importJob = await this.importJobRepository.findOne({
      where: { id: importJobId, organizationId },
    });

    if (!importJob) {
      throw new NotFoundException('Import job not found');
    }

    return importJob;
  }

  /**
   * List import jobs for organization
   */
  async listImportJobs(
    organizationId: string,
    status?: ImportJobStatus,
    limit = 50,
    offset = 0
  ): Promise<{ jobs: ImportJob[]; total: number }> {
    const where: any = { organizationId };

    if (status) {
      where.status = status;
    }

    const [jobs, total] = await this.importJobRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { jobs, total };
  }

  /**
   * Delete import job
   */
  async deleteImportJob(
    importJobId: string,
    organizationId: string
  ): Promise<void> {
    const importJob = await this.getImportJob(importJobId, organizationId);

    // Delete staged data if exists
    await this.stagingImporter.deleteStagedData(importJobId, organizationId);

    // Delete job
    await this.importJobRepository.delete(importJob.id);

    this.logger.log(`Deleted import job ${importJobId}`);
  }

  /**
   * List all staged datasets for organization
   */
  async listStagedData(
    organizationId: string,
    limit = 50,
    offset = 0
  ): Promise<{ datasets: StagedData[]; total: number }> {
    const [datasets, total] = await this.stagedDataRepository.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['importJob'],
    });

    return { datasets, total };
  }

  /**
   * Get specific staged dataset by ID
   */
  async getStagedData(
    stagedDataId: string,
    organizationId: string
  ): Promise<StagedData> {
    const stagedData = await this.stagedDataRepository.findOne({
      where: { id: stagedDataId, organizationId },
      relations: ['importJob'],
    });

    if (!stagedData) {
      throw new NotFoundException('Staged data not found');
    }

    return stagedData;
  }

  /**
   * Delete specific staged dataset by ID
   */
  async deleteStagedDataById(
    stagedDataId: string,
    organizationId: string
  ): Promise<void> {
    const stagedData = await this.getStagedData(stagedDataId, organizationId);

    // Drop the staging table
    try {
      await this.stagingImporter['dataSource'].query(
        `DROP TABLE IF EXISTS ${stagedData.tableName}`
      );
      this.logger.log(`Dropped staging table ${stagedData.tableName}`);
    } catch (error) {
      this.logger.warn(
        `Failed to drop staging table ${stagedData.tableName}: ${error.message}`
      );
      // Continue with deletion even if table drop fails
    }

    // Delete metadata record
    await this.stagedDataRepository.delete({ id: stagedDataId, organizationId });
    this.logger.log(`Deleted staged data ${stagedDataId}`);
  }

  /**
   * Get staged data by import job ID
   */
  async getStagedDataByJobId(
    importJobId: string,
    organizationId: string
  ): Promise<StagedData[]> {
    return await this.stagedDataRepository.find({
      where: { importJobId, organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Detect source type from file extension
   */
  private detectSourceType(fileName: string): ImportSourceType {
    const ext = fileName.split('.').pop()?.toLowerCase();

    const typeMap: Record<string, ImportSourceType> = {
      csv: ImportSourceType.CSV,
      xlsx: ImportSourceType.EXCEL,
      xls: ImportSourceType.EXCEL,
      json: ImportSourceType.JSON,
      parquet: ImportSourceType.PARQUET,
    };

    const sourceType = ext ? typeMap[ext] : null;

    if (!sourceType) {
      throw new BadRequestException(
        `Unsupported file extension: ${ext}. Supported formats: CSV, Excel (.xlsx, .xls), JSON`
      );
    }

    if (sourceType === ImportSourceType.PARQUET) {
      throw new BadRequestException(
        'Parquet format not yet supported (coming soon)'
      );
    }

    return sourceType;
  }

  /**
   * Extract schema from data rows
   */
  private extractSchema(
    rows: Record<string, any>[]
  ): Array<{ name: string; type: string; sample: any }> {
    if (rows.length === 0) {
      return [];
    }

    const firstRow = rows[0];
    const schema: Array<{ name: string; type: string; sample: any }> = [];

    for (const [column, value] of Object.entries(firstRow)) {
      const type = this.detectType(value);
      schema.push({ name: column, type, sample: value });
    }

    return schema;
  }

  /**
   * Detect data type of a value
   */
  private detectType(value: any): string {
    if (value === null || value === undefined) {
      return 'text';
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'numeric';
    }

    if (typeof value === 'boolean') {
      return 'boolean';
    }

    if (!isNaN(Date.parse(String(value)))) {
      return 'timestamp';
    }

    return 'text';
  }

  /**
   * Import file from URL
   */
  async importFromUrl(
    url: string,
    organizationId: string,
    uploadDto: UploadFileDto & { auth?: UrlImportConfig['auth']; headers?: Record<string, string> }
  ): Promise<ImportJob> {
    this.logger.log(`Starting URL import from: ${url}`);

    try {
      // 1. Download file using UrlImporter
      const downloadResult = await this.urlImporter.importFromUrl(url, {
        auth: uploadDto.auth,
        headers: uploadDto.headers,
      });

      // 2. Create import job
      const importJobId = uuidv4();
      const importJob = this.importJobRepository.create({
        id: importJobId,
        organizationId,
        fileName: downloadResult.fileName,
        fileSize: downloadResult.buffer.length,
        sourceType: downloadResult.sourceType,
        sourceUrl: url,
        sourceConfig: uploadDto.auth || uploadDto.headers
          ? {
              auth: uploadDto.auth,
              headers: uploadDto.headers,
            }
          : undefined,
        targetType: uploadDto.targetType,
        targetTable: uploadDto.targetTable,
        connectionId: uploadDto.connectionId,
        status: ImportJobStatus.PENDING,
        rowsProcessed: 0,
        rowsSucceeded: 0,
        rowsFailed: 0,
        errors: [],
        config: uploadDto.config,
        importMethod: 'manual',
      });

      await this.importJobRepository.save(importJob);

      this.logger.log(`Created import job ${importJobId} for URL import`);

      // 3. Process using existing pipeline (don't await)
      this.processImport(importJobId, downloadResult.buffer, organizationId, uploadDto).catch(
        (error) => {
          this.logger.error(
            `URL import job ${importJobId} failed: ${error.message}`,
            error.stack
          );
        }
      );

      return importJob;
    } catch (error) {
      this.logger.error(`Failed to start URL import: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import data from database connection to staging
   */
  async importFromDatabase(
    connectionId: string,
    organizationId: string,
    config: DatabaseImportConfig
  ): Promise<ImportJob> {
    this.logger.log(
      `Starting database import from connection ${connectionId}: ${config.schema}.${config.table}`
    );

    // Create import job
    const importJobId = uuidv4();
    const importJob = this.importJobRepository.create({
      id: importJobId,
      organizationId,
      fileName: `${config.schema}.${config.table}`,
      fileSize: 0, // Unknown until query executes
      sourceType: ImportSourceType.DATABASE,
      sourceConnectionId: connectionId,
      sourceTable: `${config.schema}.${config.table}`,
      sourceConfig: {
        query: config.whereClause,
        columns: config.columns,
      },
      targetType: ImportTargetType.STAGING,
      targetTable: config.targetTable,
      status: ImportJobStatus.PENDING,
      rowsProcessed: 0,
      rowsSucceeded: 0,
      rowsFailed: 0,
      errors: [],
      importMethod: 'manual',
    });

    await this.importJobRepository.save(importJob);

    this.logger.log(`Created import job ${importJobId} for database import`);

    // Start async import
    this.processDatabaseImport(importJobId, connectionId, organizationId, config).catch(
      (error) => {
        this.logger.error(
          `Database import job ${importJobId} failed: ${error.message}`,
          error.stack
        );
      }
    );

    return importJob;
  }

  /**
   * Process database import asynchronously
   */
  private async processDatabaseImport(
    importJobId: string,
    connectionId: string,
    organizationId: string,
    config: DatabaseImportConfig
  ): Promise<void> {
    const importJob = await this.importJobRepository.findOne({
      where: { id: importJobId },
    });

    if (!importJob) {
      throw new NotFoundException('Import job not found');
    }

    try {
      // Update status to processing
      importJob.status = ImportJobStatus.PROCESSING;
      await this.importJobRepository.save(importJob);

      // Execute database import
      const result = await this.databaseSourceImporter.importFromDatabase(
        connectionId,
        organizationId,
        config,
        importJobId
      );

      // Update job to completed
      importJob.status = ImportJobStatus.COMPLETED;
      importJob.rowsProcessed = result.rowCount;
      importJob.rowsSucceeded = result.rowCount;
      importJob.rowsFailed = 0;
      importJob.completedAt = new Date();

      await this.importJobRepository.save(importJob);

      this.logger.log(
        `Database import job ${importJobId} completed: ${result.rowCount} rows`
      );
    } catch (error) {
      // Update job status to failed
      importJob.status = ImportJobStatus.FAILED;
      importJob.errors = [
        {
          row: 0,
          column: '*',
          value: null,
          error: error.message || String(error),
          type: 'SYSTEM_ERROR',
          severity: 'error',
        },
      ];
      await this.importJobRepository.save(importJob);

      throw error;
    }
  }
}
