# Data Ingestion Enhancement Plan (REVISED)
## Building on Existing Infrastructure

## Current Infrastructure Analysis

### ✅ Already Built
- **Parsers**: CSV, Excel, JSON with streaming/chunking support
- **Import Job Tracking**: Status tracking, error logging, progress monitoring
- **Staging System**: Org-scoped schemas, table creation, metadata tracking
- **Database Importer**: Import to external databases
- **Async Processing**: Non-blocking imports with job queue
- **Schema Detection**: Automatic type inference
- **Error Handling**: Comprehensive error tracking and reporting

### 🎯 What We'll Add
- **New Import Sources**: URL, Database-to-Staging, REST API, FTP/SFTP, CKAN
- **Scheduled/Recurring Imports**: Cron-based automation
- **Data Transformation Pipeline**: Pre-import data cleaning
- **Incremental Updates**: Upsert logic for staged data
- **Data Quality Validation**: Rule-based validation before import
- **Bulk File Upload**: Multiple files at once

---

## Schema Extensions

### 1. Extend ImportSourceType Enum

**File**: `packages/backend/src/database/entities/import-job.entity.ts`

```typescript
export enum ImportSourceType {
  CSV = 'csv',
  EXCEL = 'excel',
  JSON = 'json',
  PARQUET = 'parquet',
  API = 'api',
  // NEW TYPES
  URL = 'url',           // Import from URL
  DATABASE = 'database',  // Import from database connection
  FTP = 'ftp',           // Import from FTP/SFTP
  SFTP = 'sftp',
  CKAN = 'ckan',         // Import from CKAN catalog
}
```

### 2. Extend ImportJob Entity

Add fields for new import types:

```typescript
@Column('text', { nullable: true, name: 'source_url' })
sourceUrl?: string;  // For URL, API, CKAN imports

@Column('text', { nullable: true, name: 'source_connection_id' })
sourceConnectionId?: string;  // For database imports

@Column('text', { nullable: true, name: 'source_table' })
sourceTable?: string;  // For database imports

@Column('text', { nullable: true, name: 'import_method' })
importMethod?: 'manual' | 'scheduled' | 'api';  // How import was triggered

@Column('jsonb', { nullable: true, name: 'source_config' })
sourceConfig?: {
  // URL/API config
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'api_key' | 'oauth2';
    token?: string;
    username?: string;
    password?: string;
    apiKey?: string;
  };
  headers?: Record<string, string>;

  // Database config
  query?: string;
  whereClause?: string;
  columns?: string[];

  // FTP config
  host?: string;
  port?: number;
  path?: string;

  // CKAN config
  catalogUrl?: string;
  datasetId?: string;
  resourceId?: string;
};

@Column('jsonb', { nullable: true, name: 'transformation_config' })
transformationConfig?: {
  columnMapping?: Record<string, string>;
  typeConversions?: Record<string, string>;
  rowFilters?: Array<{
    column: string;
    operator: string;
    value: any;
  }>;
  calculatedColumns?: Array<{
    name: string;
    expression: string;
  }>;
  deduplicate?: {
    keyColumns: string[];
    keep: 'first' | 'last';
  };
};

@Column('jsonb', { nullable: true, name: 'validation_config' })
validationConfig?: {
  rules: Array<{
    column: string;
    type: 'required' | 'type' | 'range' | 'regex' | 'unique';
    severity: 'error' | 'warning';
    config?: any;
  }>;
  onError: 'reject' | 'accept_with_warnings';
};
```

### 3. New Table: scheduled_imports

```sql
CREATE TABLE scheduled_imports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Import source configuration
  source_type TEXT NOT NULL,  -- 'url', 'database', 'api', 'ftp', etc.
  source_config TEXT NOT NULL,  -- Encrypted JSON

  -- Target configuration
  target_type TEXT NOT NULL DEFAULT 'staging',
  target_table TEXT,

  -- Schedule configuration
  schedule_cron TEXT NOT NULL,  -- Cron expression
  timezone TEXT DEFAULT 'UTC',
  active BOOLEAN DEFAULT true,

  -- Transformation & Validation (optional)
  transformation_config JSONB,
  validation_config JSONB,

  -- Metadata
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  last_run_status TEXT,

  UNIQUE(organization_id, name)
);

CREATE INDEX idx_scheduled_imports_org ON scheduled_imports(organization_id);
CREATE INDEX idx_scheduled_imports_next_run ON scheduled_imports(next_run_at);
CREATE INDEX idx_scheduled_imports_active ON scheduled_imports(active);
```

### 4. Migration

```bash
npm run migration:generate -- src/database/migrations/ExtendIngestionCapabilities
npm run migration:run
```

---

## Module Structure Extension

**Extend existing ingestion module** (don't create new module):

```
packages/backend/src/modules/ingestion/
├── ingestion.module.ts              # Add new providers
├── ingestion.service.ts             # Add new import methods
├── ingestion.controller.ts          # Add new endpoints
│
├── parsers/                         # ✅ Already exists
│   ├── csv-parser.service.ts
│   ├── excel-parser.service.ts
│   └── json-parser.service.ts
│
├── importers/                       # ✅ Already exists - extend
│   ├── staging-importer.service.ts  # ✅ Already exists
│   ├── database-importer.service.ts # ✅ Already exists
│   ├── url-importer.service.ts      # NEW
│   ├── database-source-importer.ts  # NEW (rename to avoid confusion)
│   ├── api-importer.service.ts      # NEW
│   ├── ftp-importer.service.ts      # NEW
│   └── ckan-importer.service.ts     # NEW
│
├── transformers/                    # NEW folder
│   ├── transformation.service.ts    # Orchestrator
│   ├── column-mapper.ts
│   ├── type-converter.ts
│   ├── row-filter.ts
│   ├── calculated-column.ts
│   └── deduplicator.ts
│
├── validators/                      # NEW folder
│   ├── validation.service.ts        # Orchestrator
│   ├── required-validator.ts
│   ├── type-validator.ts
│   ├── range-validator.ts
│   ├── regex-validator.ts
│   └── unique-validator.ts
│
├── scheduling/                      # NEW folder
│   ├── scheduler.service.ts         # Cron job manager
│   ├── scheduled-import.entity.ts
│   └── scheduled-imports.controller.ts
│
└── dto/                             # ✅ Extend existing
    ├── upload-file.dto.ts           # ✅ Already exists
    ├── preview-response.dto.ts      # ✅ Already exists
    ├── import-job-response.dto.ts   # ✅ Already exists
    ├── import-from-url.dto.ts       # NEW
    ├── import-from-database.dto.ts  # NEW
    ├── import-from-api.dto.ts       # NEW
    ├── create-schedule.dto.ts       # NEW
    └── transformation-config.dto.ts # NEW
```

---

## Implementation Plan

### Phase 1: Foundation & URL Import (Week 1)

**Goal**: Extend schema and add URL import capability

#### Step 1.1: Database Schema
1. Update `ImportSourceType` enum
2. Add new columns to `ImportJob` entity
3. Create `scheduled_imports` table
4. Generate and run migration

#### Step 1.2: URL Importer
1. Create `url-importer.service.ts`:

```typescript
@Injectable()
export class UrlImporterService {
  constructor(
    private readonly csvParser: CsvParserService,
    private readonly excelParser: ExcelParserService,
    private readonly jsonParser: JsonParserService
  ) {}

  async importFromUrl(
    url: string,
    organizationId: string,
    config: UrlImportConfig
  ): Promise<{ buffer: Buffer; fileName: string; sourceType: ImportSourceType }> {
    // 1. Download file with authentication
    const response = await this.downloadFile(url, config.auth);

    // 2. Detect file type from content-type or URL
    const sourceType = this.detectSourceType(response.headers['content-type'], url);

    // 3. Return buffer to be processed by existing pipeline
    return {
      buffer: response.data,
      fileName: this.extractFileName(url),
      sourceType
    };
  }

  private async downloadFile(url: string, auth?: AuthConfig): Promise<any> {
    const headers: any = {};

    if (auth?.type === 'bearer') {
      headers.Authorization = `Bearer ${auth.token}`;
    } else if (auth?.type === 'basic') {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }

    return await axios.get(url, {
      headers,
      responseType: 'arraybuffer',
      maxContentLength: 500 * 1024 * 1024 // 500MB
    });
  }
}
```

2. **Extend IngestionService** with URL import method:

```typescript
// In ingestion.service.ts
async importFromUrl(
  url: string,
  organizationId: string,
  config: ImportFromUrlDto
): Promise<ImportJob> {
  // 1. Download file using UrlImporter
  const { buffer, fileName, sourceType } = await this.urlImporter.importFromUrl(
    url,
    organizationId,
    config
  );

  // 2. Create import job
  const importJobId = uuidv4();
  const importJob = this.importJobRepository.create({
    id: importJobId,
    organizationId,
    fileName,
    fileSize: buffer.length,
    sourceType,
    sourceUrl: url,
    sourceConfig: config.auth ? { auth: config.auth } : undefined,
    targetType: config.targetType || 'staging',
    targetTable: config.targetTable,
    status: ImportJobStatus.PENDING,
  });

  await this.importJobRepository.save(importJob);

  // 3. Process using EXISTING pipeline (reuse processImport)
  this.processImportFromBuffer(
    importJobId,
    buffer,
    organizationId,
    config
  ).catch(error => {
    this.logger.error(`URL import ${importJobId} failed: ${error.message}`);
  });

  return importJob;
}
```

3. Add controller endpoint:

```typescript
// In ingestion.controller.ts
@Post('import/url')
@ApiOperation({ summary: 'Import data from URL' })
async importFromUrl(
  @Body() dto: ImportFromUrlDto,
  @CurrentUser() user: User
) {
  return this.ingestionService.importFromUrl(
    dto.url,
    user.organizationId,
    dto
  );
}
```

**Deliverable**: URL-based imports working with existing file processing pipeline

---

### Phase 2: Database-to-Staging Import (Week 2)

**Goal**: Import data directly from connected databases to staging

#### Step 2.1: Database Source Importer

```typescript
// database-source-importer.service.ts
@Injectable()
export class DatabaseSourceImporterService {
  constructor(
    private readonly connectionsService: ConnectionsService,
    private readonly stagingImporter: StagingImporterService
  ) {}

  async importFromDatabase(
    connectionId: string,
    organizationId: string,
    config: DatabaseImportConfig,
    importJobId: string
  ): Promise<void> {
    // 1. Get database driver
    const driver = await this.connectionsService.getDriver(connectionId);

    try {
      // 2. Build query
      const columns = config.columns?.length > 0
        ? config.columns.join(', ')
        : '*';
      const whereClause = config.whereClause
        ? `WHERE ${config.whereClause}`
        : '';
      const limitClause = config.rowLimit
        ? `LIMIT ${config.rowLimit}`
        : '';

      const sql = `
        SELECT ${columns}
        FROM ${config.schema}.${config.table}
        ${whereClause}
        ${limitClause}
      `.trim();

      // 3. Execute query with streaming
      const result = await driver.query(sql);

      // 4. Extract schema
      const schema = this.extractSchemaFromRows(result.rows);

      // 5. Import to staging using EXISTING StagingImporter
      await this.stagingImporter.importToStaging(
        organizationId,
        importJobId,
        config.targetTable || config.table,
        schema,
        result.rows
      );

    } finally {
      await driver.disconnect();
    }
  }

  private extractSchemaFromRows(rows: any[]): Array<{name: string; type: string; sample: any}> {
    // Reuse schema extraction logic from IngestionService
    if (rows.length === 0) return [];

    const firstRow = rows[0];
    return Object.entries(firstRow).map(([name, value]) => ({
      name,
      type: this.inferType(value),
      sample: value
    }));
  }
}
```

#### Step 2.2: Extend IngestionService

```typescript
// In ingestion.service.ts
async importFromDatabase(
  connectionId: string,
  organizationId: string,
  config: ImportFromDatabaseDto
): Promise<ImportJob> {
  // 1. Create import job
  const importJobId = uuidv4();
  const importJob = this.importJobRepository.create({
    id: importJobId,
    organizationId,
    fileName: `${config.schema}.${config.table}`,
    sourceType: ImportSourceType.DATABASE,
    sourceConnectionId: connectionId,
    sourceTable: `${config.schema}.${config.table}`,
    sourceConfig: {
      query: config.whereClause,
      columns: config.columns
    },
    targetType: 'staging',
    targetTable: config.targetTable,
    status: ImportJobStatus.PENDING,
  });

  await this.importJobRepository.save(importJob);

  // 2. Start async import
  this.processDatabaseImport(importJobId, connectionId, organizationId, config)
    .catch(error => {
      this.logger.error(`Database import ${importJobId} failed: ${error.message}`);
    });

  return importJob;
}

private async processDatabaseImport(
  importJobId: string,
  connectionId: string,
  organizationId: string,
  config: ImportFromDatabaseDto
): Promise<void> {
  const importJob = await this.importJobRepository.findOne({
    where: { id: importJobId }
  });

  try {
    // Update status
    importJob.status = ImportJobStatus.PROCESSING;
    await this.importJobRepository.save(importJob);

    // Import from database
    await this.databaseSourceImporter.importFromDatabase(
      connectionId,
      organizationId,
      config,
      importJobId
    );

    // Update to completed
    const stagedData = await this.stagedDataRepository.findOne({
      where: { importJobId }
    });

    importJob.status = ImportJobStatus.COMPLETED;
    importJob.rowsProcessed = stagedData?.rowCount || 0;
    importJob.rowsSucceeded = stagedData?.rowCount || 0;
    importJob.completedAt = new Date();

    await this.importJobRepository.save(importJob);

  } catch (error) {
    importJob.status = ImportJobStatus.FAILED;
    importJob.errors = [{ error: error.message }];
    await this.importJobRepository.save(importJob);
    throw error;
  }
}
```

**Deliverable**: Database-to-staging imports working

---

### Phase 3: Bulk File Upload (Week 3)

**Goal**: Upload multiple files at once

#### Step 3.1: Update Controller

```typescript
// In ingestion.controller.ts
@Post('upload/bulk')
@UseInterceptors(FilesInterceptor('files', 20))  // Max 20 files
@ApiOperation({ summary: 'Upload multiple files for import' })
async uploadBulk(
  @UploadedFiles() files: Express.Multer.File[],
  @Body() dto: BulkUploadDto,
  @CurrentUser() user: User
): Promise<{ jobs: ImportJob[]; total: number }> {
  const jobs: ImportJob[] = [];

  for (const file of files) {
    try {
      const job = await this.ingestionService.startImport(
        {
          fieldname: file.fieldname,
          originalname: file.originalname,
          encoding: file.encoding,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer
        },
        user.organizationId,
        {
          targetType: dto.targetType || 'staging',
          targetTable: dto.targetTable,
          config: dto.config
        }
      );
      jobs.push(job);
    } catch (error) {
      this.logger.error(`Failed to process file ${file.originalname}:`, error);
      // Continue with other files
    }
  }

  return { jobs, total: jobs.length };
}
```

#### Step 3.2: Frontend Component

```typescript
// BulkFileUploader.tsx
const BulkFileUploader = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<Map<string, 'pending' | 'uploading' | 'success' | 'failed'>>(new Map());

  const { getRootProps, getInputProps } = useDropzone({
    multiple: true,
    maxFiles: 20,
    onDrop: (acceptedFiles) => {
      setFiles(prev => [...prev, ...acceptedFiles]);
      acceptedFiles.forEach(file => {
        setUploadStatus(prev => new Map(prev).set(file.name, 'pending'));
      });
    }
  });

  const uploadAll = async () => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('targetType', 'staging');

    // Upload all files at once
    const response = await api.ingestion.uploadBulk(formData);

    // Update status based on response
    response.jobs.forEach(job => {
      setUploadStatus(prev =>
        new Map(prev).set(job.fileName, job.status === 'pending' ? 'success' : 'failed')
      );
    });
  };

  return (
    <div>
      <div {...getRootProps()} className="border-2 border-dashed p-8 text-center cursor-pointer">
        <input {...getInputProps()} />
        <p>Drag & drop files here, or click to select (max 20 files)</p>
      </div>

      <div className="mt-4 space-y-2">
        {files.map(file => (
          <div key={file.name} className="flex items-center justify-between p-2 border rounded">
            <span>{file.name}</span>
            <StatusBadge status={uploadStatus.get(file.name)} />
          </div>
        ))}
      </div>

      {files.length > 0 && (
        <Button onClick={uploadAll} className="mt-4">
          Upload All Files
        </Button>
      )}
    </div>
  );
};
```

**Deliverable**: Bulk file upload with progress tracking

---

### Phase 4: Data Transformation (Week 4-5)

**Goal**: Transform data during import

#### Step 4.1: Transformation Service

```typescript
// transformers/transformation.service.ts
@Injectable()
export class TransformationService {
  async applyTransformations(
    data: any[],
    config: TransformationConfig
  ): Promise<any[]> {
    let transformed = [...data];

    // Apply each transformation in order
    if (config.columnMapping) {
      transformed = this.applyColumnMapping(transformed, config.columnMapping);
    }

    if (config.typeConversions) {
      transformed = this.applyTypeConversions(transformed, config.typeConversions);
    }

    if (config.rowFilters) {
      transformed = this.applyRowFilters(transformed, config.rowFilters);
    }

    if (config.calculatedColumns) {
      transformed = this.applyCalculatedColumns(transformed, config.calculatedColumns);
    }

    if (config.deduplicate) {
      transformed = this.applyDeduplication(transformed, config.deduplicate);
    }

    return transformed;
  }

  private applyColumnMapping(data: any[], mapping: Record<string, string>): any[] {
    return data.map(row => {
      const newRow: any = {};
      for (const [oldName, newName] of Object.entries(mapping)) {
        if (row.hasOwnProperty(oldName)) {
          newRow[newName] = row[oldName];
        }
      }
      // Keep unmapped columns
      for (const [key, value] of Object.entries(row)) {
        if (!mapping.hasOwnProperty(key)) {
          newRow[key] = value;
        }
      }
      return newRow;
    });
  }

  private applyRowFilters(data: any[], filters: any[]): any[] {
    return data.filter(row => {
      return filters.every(filter => {
        const value = row[filter.column];
        switch (filter.operator) {
          case '=': return value === filter.value;
          case '!=': return value !== filter.value;
          case '>': return value > filter.value;
          case '<': return value < filter.value;
          case 'contains': return String(value).includes(filter.value);
          default: return true;
        }
      });
    });
  }

  private applyDeduplication(data: any[], config: any): any[] {
    const seen = new Map();
    const result: any[] = [];

    for (const row of data) {
      const key = config.keyColumns.map((col: string) => row[col]).join('|');

      if (!seen.has(key)) {
        seen.set(key, true);
        result.push(row);
      } else if (config.keep === 'last') {
        // Replace with latest
        const index = result.findIndex(r =>
          config.keyColumns.map((col: string) => r[col]).join('|') === key
        );
        if (index >= 0) result[index] = row;
      }
    }

    return result;
  }
}
```

#### Step 4.2: Integrate into Import Pipeline

```typescript
// In ingestion.service.ts - modify processImport
private async processImport(...): Promise<void> {
  // ... existing code ...

  // Add transformation step BEFORE importing to staging
  const handleChunk = async (chunk: Record<string, any>[], chunkErrors: any[]) => {
    // Apply transformations if configured
    let processedChunk = chunk;
    if (uploadDto.transformationConfig) {
      processedChunk = await this.transformationService.applyTransformations(
        chunk,
        uploadDto.transformationConfig
      );
    }

    // Continue with existing import logic
    if (uploadDto.targetType === 'staging') {
      const schema = this.extractSchema(processedChunk);
      await this.stagingImporter.importToStaging(
        organizationId,
        importJobId,
        uploadDto.targetTable || importJob.fileName,
        schema,
        processedChunk
      );
    }
    // ...
  };

  // ... rest of existing code ...
}
```

**Deliverable**: Transformation pipeline integrated into all import methods

---

### Phase 5: Data Validation (Week 6)

**Goal**: Validate data quality before import

#### Step 5.1: Validation Service

```typescript
// validators/validation.service.ts
@Injectable()
export class ValidationService {
  async validate(
    data: any[],
    config: ValidationConfig
  ): Promise<{
    valid: boolean;
    validRows: any[];
    invalidRows: Array<{row: any; errors: any[]}>;
    errors: any[];
  }> {
    const validRows: any[] = [];
    const invalidRows: any[] = [];
    const allErrors: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowErrors: any[] = [];

      for (const rule of config.rules) {
        const result = this.validateRule(row, rule);
        if (!result.valid) {
          const error = {
            row: i,
            column: rule.column,
            value: row[rule.column],
            rule: rule.type,
            severity: rule.severity,
            message: result.message
          };
          rowErrors.push(error);
          allErrors.push(error);
        }
      }

      if (rowErrors.some(e => e.severity === 'error')) {
        invalidRows.push({ row, errors: rowErrors });
      } else {
        validRows.push(row);
      }
    }

    return {
      valid: invalidRows.length === 0,
      validRows,
      invalidRows,
      errors: allErrors
    };
  }

  private validateRule(row: any, rule: any): {valid: boolean; message?: string} {
    const value = row[rule.column];

    switch (rule.type) {
      case 'required':
        return {
          valid: value !== null && value !== undefined && value !== '',
          message: `${rule.column} is required`
        };

      case 'type':
        const expectedType = rule.config.expectedType;
        const actualType = typeof value;
        return {
          valid: actualType === expectedType,
          message: `${rule.column} must be ${expectedType}, got ${actualType}`
        };

      case 'range':
        if (typeof value !== 'number') {
          return { valid: false, message: `${rule.column} must be a number` };
        }
        const inRange = value >= rule.config.min && value <= rule.config.max;
        return {
          valid: inRange,
          message: `${rule.column} must be between ${rule.config.min} and ${rule.config.max}`
        };

      case 'regex':
        const regex = new RegExp(rule.config.pattern);
        return {
          valid: regex.test(String(value)),
          message: rule.config.message || `${rule.column} format is invalid`
        };

      default:
        return { valid: true };
    }
  }
}
```

#### Step 5.2: Integrate Validation

```typescript
// In ingestion.service.ts
const handleChunk = async (chunk: Record<string, any>[], chunkErrors: any[]) => {
  let processedChunk = chunk;

  // 1. Validate if configured
  if (uploadDto.validationConfig) {
    const validation = await this.validationService.validate(
      chunk,
      uploadDto.validationConfig
    );

    if (!validation.valid) {
      if (uploadDto.validationConfig.onError === 'reject') {
        // Store errors and skip invalid rows
        allErrors.push(...validation.errors);
        processedChunk = validation.validRows;
      } else {
        // Accept with warnings
        allErrors.push(...validation.errors.filter(e => e.severity === 'warning'));
      }
    }
  }

  // 2. Apply transformations
  if (uploadDto.transformationConfig && processedChunk.length > 0) {
    processedChunk = await this.transformationService.applyTransformations(
      processedChunk,
      uploadDto.transformationConfig
    );
  }

  // 3. Import to staging
  if (processedChunk.length > 0) {
    // ... existing import logic ...
  }
};
```

**Deliverable**: Data validation with configurable rules

---

### Phase 6: Scheduled Imports (Week 7-8)

**Goal**: Automate recurring imports

#### Step 6.1: Scheduler Service

```typescript
// scheduling/scheduler.service.ts
@Injectable()
export class SchedulerService implements OnModuleInit {
  private scheduledJobs: Map<string, CronJob> = new Map();

  constructor(
    @InjectRepository(ScheduledImport)
    private scheduledImportRepository: Repository<ScheduledImport>,
    private ingestionService: IngestionService,
    private schedulerRegistry: SchedulerRegistry
  ) {}

  async onModuleInit() {
    // Load all active schedules on startup
    const schedules = await this.scheduledImportRepository.find({
      where: { active: true }
    });

    for (const schedule of schedules) {
      await this.scheduleJob(schedule);
    }
  }

  async scheduleJob(schedule: ScheduledImport) {
    const job = new CronJob(
      schedule.scheduleCron,
      () => this.executeScheduledImport(schedule.id),
      null,
      true,
      schedule.timezone
    );

    this.schedulerRegistry.addCronJob(schedule.id, job);
    job.start();

    // Calculate next run
    const nextRun = job.nextDate().toJSDate();
    await this.scheduledImportRepository.update(schedule.id, {
      nextRunAt: nextRun
    });
  }

  async executeScheduledImport(scheduleId: string) {
    const schedule = await this.scheduledImportRepository.findOne({
      where: { id: scheduleId }
    });

    if (!schedule || !schedule.active) return;

    try {
      const sourceConfig = JSON.parse(schedule.sourceConfig);

      let importJob: ImportJob;

      // Route to appropriate import method based on source type
      switch (schedule.sourceType) {
        case 'url':
          importJob = await this.ingestionService.importFromUrl(
            sourceConfig.url,
            schedule.organizationId,
            {
              ...sourceConfig,
              targetType: schedule.targetType,
              targetTable: schedule.targetTable,
              transformationConfig: schedule.transformationConfig,
              validationConfig: schedule.validationConfig
            }
          );
          break;

        case 'database':
          importJob = await this.ingestionService.importFromDatabase(
            sourceConfig.connectionId,
            schedule.organizationId,
            {
              ...sourceConfig,
              targetTable: schedule.targetTable,
              transformationConfig: schedule.transformationConfig,
              validationConfig: schedule.validationConfig
            }
          );
          break;

        // Add other source types...
      }

      // Update last run
      await this.scheduledImportRepository.update(scheduleId, {
        lastRunAt: new Date(),
        lastRunStatus: 'success'
      });

    } catch (error) {
      await this.scheduledImportRepository.update(scheduleId, {
        lastRunAt: new Date(),
        lastRunStatus: 'failed'
      });
      this.logger.error(`Scheduled import ${scheduleId} failed:`, error);
    }
  }
}
```

**Deliverable**: Scheduled imports working with cron expressions

---

### Phase 7: Incremental Updates (Week 9)

**Goal**: Update existing staged data instead of full replacement

#### Step 7.1: Incremental Importer

```typescript
// importers/incremental-importer.service.ts
@Injectable()
export class IncrementalImporterService {
  async performIncrementalUpdate(
    existingStagedDataId: string,
    newData: any[],
    primaryKeys: string[],
    mode: 'upsert' | 'append'
  ): Promise<{inserted: number; updated: number}> {
    const stagedData = await this.stagedDataRepository.findOne({
      where: { id: existingStagedDataId }
    });

    let inserted = 0;
    let updated = 0;

    if (mode === 'append') {
      // Simple append - just insert all new rows
      await this.insertRows(stagedData.tableName, newData);
      inserted = newData.length;
    } else {
      // Upsert - check for existing keys
      for (const row of newData) {
        const keyValues = primaryKeys.map(pk => row[pk]);
        const exists = await this.rowExists(stagedData.tableName, primaryKeys, keyValues);

        if (exists) {
          await this.updateRow(stagedData.tableName, primaryKeys, row);
          updated++;
        } else {
          await this.insertRow(stagedData.tableName, row);
          inserted++;
        }
      }
    }

    // Update row count
    const newRowCount = await this.getRowCount(stagedData.tableName);
    await this.stagedDataRepository.update(existingStagedDataId, {
      rowCount: newRowCount
    });

    return { inserted, updated };
  }

  private async updateRow(tableName: string, primaryKeys: string[], row: any) {
    const setClauses = Object.keys(row)
      .filter(col => !primaryKeys.includes(col))
      .map(col => `${this.quoteIdent(col)} = $${col}`)
      .join(', ');

    const whereClauses = primaryKeys
      .map((pk, idx) => `${this.quoteIdent(pk)} = $pk${idx}`)
      .join(' AND ');

    await this.dataSource.query(
      `UPDATE ${tableName} SET ${setClauses} WHERE ${whereClauses}`,
      { ...row, ...Object.fromEntries(primaryKeys.map((pk, idx) => [`pk${idx}`, row[pk]])) }
    );
  }
}
```

**Deliverable**: Incremental updates with upsert logic

---

### Phase 8: REST API & FTP (Week 10-11)

Follow similar pattern as URL importer but with:
- **API Importer**: Pagination, OAuth2, rate limiting
- **FTP Importer**: SSH keys, file pattern matching

---

## Frontend Pages

### Updated Ingestion Page

```
packages/frontend/app/ingestion/
├── page.tsx                    # Main hub with tabs
├── upload/page.tsx             # ✅ Already exists
├── url/page.tsx                # NEW - URL import form
├── database/page.tsx           # NEW - Database import wizard
├── schedules/page.tsx          # NEW - Manage schedules
└── jobs/page.tsx               # ✅ Already exists
```

---

## Dependencies

```json
{
  "dependencies": {
    "@nestjs/schedule": "^4.0.0",
    "axios": "^1.6.0",  // For URL/API imports
    "ssh2-sftp-client": "^9.1.0",  // For FTP imports (Phase 8)
    "node-cron": "^3.0.2"
  }
}
```

---

## Timeline

- **Week 1**: URL Import
- **Week 2**: Database-to-Staging Import
- **Week 3**: Bulk Upload
- **Week 4-5**: Transformations
- **Week 6**: Validation
- **Week 7-8**: Scheduled Imports
- **Week 9**: Incremental Updates
- **Week 10-11**: REST API & FTP

**Total: 11 weeks**

---

## Success Criteria

- ✅ URL imports working with authentication
- ✅ Database-to-staging imports with column selection and filtering
- ✅ Bulk file upload (up to 20 files)
- ✅ Data transformations applied during import
- ✅ Data quality validation with configurable rules
- ✅ Scheduled imports running on cron schedules
- ✅ Incremental updates with upsert logic
- ✅ All import methods reuse existing parsers and staging infrastructure
- ✅ Import jobs tracked consistently across all methods
- ✅ Comprehensive error handling and logging

---

## Key Advantages of This Approach

1. **Reuses Existing Code**: Builds on parsers, staging system, job tracking
2. **Consistent Experience**: All import methods follow same pattern
3. **Incremental Development**: Each phase adds value independently
4. **Minimal Breaking Changes**: Extends rather than replaces
5. **Proven Architecture**: Leverages battle-tested components

Ready to start with Phase 1 (URL Import)?
