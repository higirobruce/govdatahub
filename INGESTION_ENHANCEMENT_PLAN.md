# Data Ingestion Enhancement Plan

## Overview

Extend GovDataHub's data ingestion capabilities beyond file uploads to support:
- **Phase 1**: Database Direct Import, URL-Based Import, Bulk File Upload
- **Phase 2**: Scheduled/Recurring Imports, Data Transformation on Import, Incremental Updates
- **Additional**: REST API Integration, Data Quality Validation, FTP/SFTP, Data Catalog Federation

**Current State**: System supports manual file uploads (CSV, Excel, JSON) to staging area.

**Goal**: Provide multiple automated and flexible data import methods suitable for government data operations.

---

## Database Schema Extensions

### New Tables

**import_sources** - Configuration for various import sources
```sql
CREATE TABLE import_sources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'database', 'url', 'api', 'ftp', 'google_sheets', 'ckan'
  )),
  config TEXT NOT NULL,  -- Encrypted JSON with source-specific config
  active BOOLEAN DEFAULT true,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_sync_at TIMESTAMP,
  last_sync_status TEXT,
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_import_sources_org ON import_sources(organization_id);
CREATE INDEX idx_import_sources_type ON import_sources(type);
CREATE INDEX idx_import_sources_active ON import_sources(active);
```

**scheduled_imports** - Recurring import jobs
```sql
CREATE TABLE scheduled_imports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  import_source_id TEXT REFERENCES import_sources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  schedule_cron TEXT NOT NULL,  -- Cron expression
  target_table TEXT,  -- Optional: specific staging table name
  transform_config TEXT,  -- JSON with transformation rules
  validation_config TEXT,  -- JSON with validation rules
  active BOOLEAN DEFAULT true,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_scheduled_imports_org ON scheduled_imports(organization_id);
CREATE INDEX idx_scheduled_imports_source ON scheduled_imports(import_source_id);
CREATE INDEX idx_scheduled_imports_next_run ON scheduled_imports(next_run_at);
CREATE INDEX idx_scheduled_imports_active ON scheduled_imports(active);
```

**import_executions** - Track each import execution
```sql
CREATE TABLE import_executions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scheduled_import_id TEXT REFERENCES scheduled_imports(id) ON DELETE SET NULL,
  import_source_id TEXT REFERENCES import_sources(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'webhook')),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
  rows_imported INTEGER,
  rows_rejected INTEGER,
  validation_errors TEXT,  -- JSON array of validation errors
  error_message TEXT,
  staged_data_id TEXT REFERENCES staged_data(id) ON DELETE SET NULL,
  FOREIGN KEY (staged_data_id) REFERENCES staged_data(id)
);

CREATE INDEX idx_import_executions_org ON import_executions(organization_id);
CREATE INDEX idx_import_executions_scheduled ON import_executions(scheduled_import_id);
CREATE INDEX idx_import_executions_started ON import_executions(started_at DESC);
CREATE INDEX idx_import_executions_status ON import_executions(status);
```

**data_validation_rules** - Reusable validation rules
```sql
CREATE TABLE data_validation_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'required', 'data_type', 'range', 'regex', 'unique', 'foreign_key', 'custom'
  )),
  config TEXT NOT NULL,  -- JSON with rule-specific config
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_validation_rules_org ON data_validation_rules(organization_id);
```

**transformation_templates** - Reusable transformation configs
```sql
CREATE TABLE transformation_templates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  transformations TEXT NOT NULL,  -- JSON array of transformation steps
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE INDEX idx_transformation_templates_org ON transformation_templates(organization_id);
```

### Updated Tables

**staged_data** - Add import source tracking
```sql
ALTER TABLE staged_data
  ADD COLUMN import_source_id TEXT REFERENCES import_sources(id) ON DELETE SET NULL,
  ADD COLUMN import_execution_id TEXT REFERENCES import_executions(id) ON DELETE SET NULL,
  ADD COLUMN import_method TEXT CHECK (import_method IN ('upload', 'database', 'url', 'api', 'ftp', 'google_sheets', 'ckan'));
```

---

## Architecture Design

### Module Structure

```
packages/backend/src/modules/ingestion-v2/
├── ingestion-v2.module.ts
├── import-sources/
│   ├── import-sources.service.ts      # CRUD for import sources
│   ├── import-sources.controller.ts   # REST API
│   ├── importers/
│   │   ├── base-importer.ts           # Abstract base class
│   │   ├── database-importer.ts       # Import from databases
│   │   ├── url-importer.ts            # Import from URLs
│   │   ├── api-importer.ts            # Import from REST APIs
│   │   ├── ftp-importer.ts            # Import from FTP/SFTP
│   │   ├── google-sheets-importer.ts  # Import from Google Sheets
│   │   └── ckan-importer.ts           # Import from CKAN catalogs
│   └── dto/
│       ├── create-import-source.dto.ts
│       ├── database-import-config.dto.ts
│       ├── url-import-config.dto.ts
│       └── api-import-config.dto.ts
├── scheduled-imports/
│   ├── scheduled-imports.service.ts   # CRUD for scheduled imports
│   ├── scheduled-imports.controller.ts
│   ├── import-scheduler.service.ts    # Cron job scheduler
│   └── dto/
│       └── create-scheduled-import.dto.ts
├── data-transformation/
│   ├── transformation.service.ts      # Apply transformations
│   ├── transformers/
│   │   ├── column-mapper.ts           # Rename/select columns
│   │   ├── data-type-converter.ts     # Convert types
│   │   ├── filter-rows.ts             # Apply WHERE-like filters
│   │   ├── calculated-columns.ts      # Add computed columns
│   │   └── deduplicator.ts            # Remove duplicates
│   └── dto/
│       └── transformation-config.dto.ts
├── data-validation/
│   ├── validation.service.ts          # Validate data
│   ├── validators/
│   │   ├── required-validator.ts
│   │   ├── type-validator.ts
│   │   ├── range-validator.ts
│   │   ├── regex-validator.ts
│   │   └── unique-validator.ts
│   └── dto/
│       └── validation-config.dto.ts
└── import-executor/
    ├── import-executor.service.ts     # Orchestrate imports
    └── import-executor.controller.ts  # Manual trigger endpoint
```

---

## Feature Implementation Details

### 1. Database Direct Import

**User Flow**:
1. Navigate to Ingestion → Database Import
2. Select existing connection
3. Select schema and table
4. Preview data (first 100 rows)
5. Configure:
   - Column selection (or all columns)
   - Optional WHERE filter
   - Row limit (or full table)
   - Target staging table name
6. Execute import immediately or schedule

**Backend Implementation**:

```typescript
// database-importer.ts
export class DatabaseImporter extends BaseImporter {
  async import(config: DatabaseImportConfig): Promise<ImportResult> {
    // 1. Get database driver
    const driver = await this.getDriver(config.connectionId);

    // 2. Build query
    const columns = config.columns?.join(', ') || '*';
    const whereClause = config.whereClause ? `WHERE ${config.whereClause}` : '';
    const limitClause = config.rowLimit ? `LIMIT ${config.rowLimit}` : '';
    const sql = `SELECT ${columns} FROM ${config.schema}.${config.table} ${whereClause} ${limitClause}`;

    // 3. Execute query with streaming
    const result = await driver.queryStream(sql);

    // 4. Create staging table
    const stagingTable = await this.createStagingTable(result.columns);

    // 5. Insert data in batches
    let rowsImported = 0;
    for await (const batch of result.batches(1000)) {
      await this.insertBatch(stagingTable, batch);
      rowsImported += batch.length;
    }

    // 6. Create staged_data record
    const stagedData = await this.createStagedDataRecord({
      tableName: stagingTable,
      rowCount: rowsImported,
      importMethod: 'database',
      importSourceId: config.sourceId
    });

    return { success: true, rowsImported, stagedData };
  }
}
```

**API Endpoints**:
```typescript
// Database import endpoints
POST   /api/ingestion-v2/database/preview      # Preview data from DB table
POST   /api/ingestion-v2/database/import       # Execute one-time import
POST   /api/ingestion-v2/database/schedule     # Schedule recurring import
```

**Frontend Components**:
```
DatabaseImportWizard.tsx
├── ConnectionSelector          # Select source connection
├── SchemaTableSelector         # Browse schema/tables
├── DataPreview                 # Show sample data
├── ColumnSelector              # Select columns to import
├── FilterBuilder               # Optional WHERE clause
└── ImportConfiguration         # Name, schedule, etc.
```

---

### 2. URL-Based Import

**User Flow**:
1. Navigate to Ingestion → URL Import
2. Paste URL to CSV/JSON/Excel file
3. Optional: Add authentication (Bearer token, Basic auth)
4. Preview data
5. Configure transformations/validations
6. Execute import

**Backend Implementation**:

```typescript
// url-importer.ts
export class UrlImporter extends BaseImporter {
  async import(config: UrlImportConfig): Promise<ImportResult> {
    // 1. Download file
    const response = await this.downloadFile(config.url, config.auth);

    // 2. Detect file type from content-type or extension
    const fileType = this.detectFileType(response);

    // 3. Parse based on type
    let data: any[];
    switch (fileType) {
      case 'csv':
        data = await this.parseCsv(response.data);
        break;
      case 'json':
        data = await this.parseJson(response.data);
        break;
      case 'excel':
        data = await this.parseExcel(response.data);
        break;
    }

    // 4. Import to staging (reuse existing staging logic)
    return await this.importToStaging(data, config);
  }

  private async downloadFile(url: string, auth?: AuthConfig): Promise<any> {
    const headers: any = {};
    if (auth?.type === 'bearer') {
      headers.Authorization = `Bearer ${auth.token}`;
    } else if (auth?.type === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
    }

    return await axios.get(url, { headers, responseType: 'arraybuffer' });
  }
}
```

**API Endpoints**:
```typescript
POST   /api/ingestion-v2/url/preview      # Preview data from URL
POST   /api/ingestion-v2/url/import       # Execute one-time import
POST   /api/ingestion-v2/url/schedule     # Schedule recurring import
```

---

### 3. Bulk File Upload

**User Flow**:
1. Navigate to Ingestion → Upload Files
2. Drag-and-drop or select multiple files
3. See upload progress for each file
4. Option: Merge similar files or keep separate
5. Preview each file before confirming
6. Batch import all files

**Backend Implementation**:

```typescript
// ingestion-v2.controller.ts
@Post('upload/bulk')
@UseInterceptors(FilesInterceptor('files', 20))  // Max 20 files
async uploadBulk(
  @UploadedFiles() files: Express.Multer.File[],
  @Body() dto: BulkUploadDto,
  @CurrentUser() user: User
) {
  const results = [];

  for (const file of files) {
    try {
      const result = await this.ingestionService.upload(file, {
        targetType: 'staging',
        ...dto
      }, user.organizationId);
      results.push({ file: file.originalname, status: 'success', result });
    } catch (error) {
      results.push({ file: file.originalname, status: 'failed', error: error.message });
    }
  }

  return {
    total: files.length,
    successful: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    results
  };
}
```

**Frontend Components**:
```typescript
// BulkUploadComponent.tsx
const BulkUpload = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  };

  const uploadAll = async () => {
    for (const file of files) {
      await uploadWithProgress(file, (progress) => {
        setUploadProgress(prev => new Map(prev).set(file.name, progress));
      });
    }
  };

  return (
    <div {...getRootProps()}>
      <input {...getInputProps()} multiple />
      {/* Progress bars for each file */}
      {files.map(file => (
        <ProgressBar key={file.name} file={file} progress={uploadProgress.get(file.name)} />
      ))}
    </div>
  );
};
```

---

### 4. Scheduled/Recurring Imports

**User Flow**:
1. Create any import source (database, URL, API, etc.)
2. Click "Schedule" button
3. Configure schedule:
   - Frequency: Daily, Weekly, Monthly, Custom (cron)
   - Time of day
   - Timezone
4. Set up notifications (email on success/failure)
5. Activate schedule

**Backend Implementation**:

```typescript
// import-scheduler.service.ts
@Injectable()
export class ImportSchedulerService {
  private scheduledJobs: Map<string, ScheduledTask> = new Map();

  constructor(
    @InjectRepository(ScheduledImport)
    private scheduledImportRepository: Repository<ScheduledImport>,
    private importExecutor: ImportExecutorService,
    private schedulerRegistry: SchedulerRegistry
  ) {}

  async onModuleInit() {
    // Load all active scheduled imports
    const schedules = await this.scheduledImportRepository.find({
      where: { active: true }
    });

    for (const schedule of schedules) {
      await this.scheduleJob(schedule);
    }
  }

  async scheduleJob(schedule: ScheduledImport) {
    const job = new CronJob(schedule.scheduleCron, async () => {
      await this.executeScheduledImport(schedule.id);
    });

    this.schedulerRegistry.addCronJob(schedule.id, job);
    job.start();

    // Calculate next run time
    const nextRun = job.nextDate().toJSDate();
    await this.scheduledImportRepository.update(schedule.id, { nextRunAt: nextRun });
  }

  async executeScheduledImport(scheduleId: string) {
    const schedule = await this.scheduledImportRepository.findOne({
      where: { id: scheduleId },
      relations: ['importSource']
    });

    if (!schedule || !schedule.active) return;

    try {
      // Execute import
      const execution = await this.importExecutor.execute({
        importSourceId: schedule.importSourceId,
        scheduledImportId: scheduleId,
        triggerType: 'scheduled',
        transformConfig: schedule.transformConfig,
        validationConfig: schedule.validationConfig
      });

      // Update last run
      await this.scheduledImportRepository.update(scheduleId, {
        lastRunAt: new Date()
      });

      // Send success notification
      await this.sendNotification(schedule, 'success', execution);

    } catch (error) {
      // Send failure notification
      await this.sendNotification(schedule, 'failed', { error: error.message });
    }
  }

  async sendNotification(schedule: ScheduledImport, status: string, data: any) {
    // TODO: Email notification implementation
    this.logger.log(`Scheduled import ${schedule.name} ${status}`, data);
  }
}
```

**API Endpoints**:
```typescript
POST   /api/ingestion-v2/schedules               # Create scheduled import
GET    /api/ingestion-v2/schedules               # List all schedules
GET    /api/ingestion-v2/schedules/:id           # Get schedule details
PATCH  /api/ingestion-v2/schedules/:id           # Update schedule
DELETE /api/ingestion-v2/schedules/:id           # Delete schedule
POST   /api/ingestion-v2/schedules/:id/activate  # Activate schedule
POST   /api/ingestion-v2/schedules/:id/pause     # Pause schedule
POST   /api/ingestion-v2/schedules/:id/run-now   # Trigger immediate run
GET    /api/ingestion-v2/schedules/:id/executions # Get execution history
```

---

### 5. Data Transformation on Import

**Transformation Types**:

1. **Column Mapping**: Rename or select specific columns
2. **Data Type Conversion**: String → Number, String → Date, etc.
3. **Row Filtering**: Keep rows matching conditions
4. **Calculated Columns**: Add derived columns (e.g., full_name = first_name + last_name)
5. **Deduplication**: Remove duplicate rows based on key columns
6. **Value Mapping**: Replace values (e.g., "M" → "Male", "F" → "Female")

**Configuration Format**:

```json
{
  "transformations": [
    {
      "type": "column_mapping",
      "config": {
        "mappings": {
          "old_name": "new_name",
          "user_id": "id"
        },
        "keep_unmapped": false
      }
    },
    {
      "type": "data_type_conversion",
      "config": {
        "conversions": {
          "age": "integer",
          "created_at": "timestamp",
          "price": "decimal"
        }
      }
    },
    {
      "type": "row_filter",
      "config": {
        "conditions": [
          { "column": "status", "operator": "=", "value": "active" },
          { "column": "age", "operator": ">", "value": 18 }
        ],
        "logic": "AND"
      }
    },
    {
      "type": "calculated_column",
      "config": {
        "columns": [
          {
            "name": "full_name",
            "expression": "CONCAT(first_name, ' ', last_name)"
          },
          {
            "name": "age_group",
            "expression": "CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END"
          }
        ]
      }
    },
    {
      "type": "deduplicate",
      "config": {
        "key_columns": ["email"],
        "keep": "first"  // or "last"
      }
    },
    {
      "type": "value_mapping",
      "config": {
        "column": "gender",
        "mappings": {
          "M": "Male",
          "F": "Female",
          "O": "Other"
        },
        "default": "Unknown"
      }
    }
  ]
}
```

**Backend Implementation**:

```typescript
// transformation.service.ts
export class TransformationService {
  async applyTransformations(
    data: any[],
    config: TransformationConfig
  ): Promise<any[]> {
    let transformedData = [...data];

    for (const transformation of config.transformations) {
      switch (transformation.type) {
        case 'column_mapping':
          transformedData = this.applyColumnMapping(transformedData, transformation.config);
          break;
        case 'data_type_conversion':
          transformedData = this.applyTypeConversion(transformedData, transformation.config);
          break;
        case 'row_filter':
          transformedData = this.applyRowFilter(transformedData, transformation.config);
          break;
        case 'calculated_column':
          transformedData = this.applyCalculatedColumns(transformedData, transformation.config);
          break;
        case 'deduplicate':
          transformedData = this.applyDeduplication(transformedData, transformation.config);
          break;
        case 'value_mapping':
          transformedData = this.applyValueMapping(transformedData, transformation.config);
          break;
      }
    }

    return transformedData;
  }

  private applyColumnMapping(data: any[], config: any): any[] {
    return data.map(row => {
      const newRow: any = {};
      for (const [oldName, newName] of Object.entries(config.mappings)) {
        if (row.hasOwnProperty(oldName)) {
          newRow[newName as string] = row[oldName];
        }
      }
      if (config.keep_unmapped) {
        for (const [key, value] of Object.entries(row)) {
          if (!config.mappings.hasOwnProperty(key)) {
            newRow[key] = value;
          }
        }
      }
      return newRow;
    });
  }

  private applyRowFilter(data: any[], config: any): any[] {
    return data.filter(row => {
      const results = config.conditions.map((cond: any) => {
        const value = row[cond.column];
        switch (cond.operator) {
          case '=': return value === cond.value;
          case '!=': return value !== cond.value;
          case '>': return value > cond.value;
          case '<': return value < cond.value;
          case '>=': return value >= cond.value;
          case '<=': return value <= cond.value;
          case 'contains': return String(value).includes(cond.value);
          default: return true;
        }
      });

      return config.logic === 'AND'
        ? results.every(r => r)
        : results.some(r => r);
    });
  }
}
```

**Frontend Component**:

```typescript
// TransformationBuilder.tsx
const TransformationBuilder = ({ onChange }) => {
  const [transformations, setTransformations] = useState([]);

  const addTransformation = (type: string) => {
    setTransformations([...transformations, { type, config: {} }]);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => addTransformation('column_mapping')}>
          Rename Columns
        </Button>
        <Button onClick={() => addTransformation('row_filter')}>
          Filter Rows
        </Button>
        <Button onClick={() => addTransformation('calculated_column')}>
          Add Column
        </Button>
        <Button onClick={() => addTransformation('deduplicate')}>
          Remove Duplicates
        </Button>
      </div>

      {transformations.map((transform, idx) => (
        <TransformationCard
          key={idx}
          transformation={transform}
          onChange={(updated) => updateTransformation(idx, updated)}
          onRemove={() => removeTransformation(idx)}
        />
      ))}
    </div>
  );
};
```

---

### 6. Incremental Updates

**Goal**: Update existing staged data instead of full replacement.

**User Flow**:
1. Select existing staged dataset
2. Configure incremental import:
   - Primary key column(s) for matching
   - Update strategy: Upsert or Append
   - Optional: Delete missing rows
3. Execute import

**Backend Implementation**:

```typescript
// incremental-importer.ts
export class IncrementalImporter {
  async performIncrementalUpdate(
    existingStagedDataId: string,
    newData: any[],
    config: IncrementalConfig
  ): Promise<IncrementalResult> {
    const { primaryKeys, updateStrategy, deleteMissing } = config;

    // 1. Get existing staged table
    const stagedData = await this.stagedDataRepository.findOne({
      where: { id: existingStagedDataId }
    });

    // 2. Build key map from new data
    const newDataMap = new Map();
    for (const row of newData) {
      const key = this.buildKey(row, primaryKeys);
      newDataMap.set(key, row);
    }

    // 3. Query existing data
    const existingData = await this.queryExistingData(stagedData.tableName);
    const existingKeySet = new Set();

    let inserted = 0;
    let updated = 0;
    let deleted = 0;

    // 4. Perform upserts
    for (const row of newData) {
      const key = this.buildKey(row, primaryKeys);
      const exists = existingKeySet.has(key);

      if (exists) {
        if (updateStrategy === 'upsert') {
          await this.updateRow(stagedData.tableName, row, primaryKeys);
          updated++;
        }
        // If 'append', skip updates
      } else {
        await this.insertRow(stagedData.tableName, row);
        inserted++;
      }

      existingKeySet.add(key);
    }

    // 5. Delete missing rows if configured
    if (deleteMissing) {
      for (const [key, row] of existingData) {
        if (!newDataMap.has(key)) {
          await this.deleteRow(stagedData.tableName, row, primaryKeys);
          deleted++;
        }
      }
    }

    // 6. Update row count
    const newRowCount = await this.getRowCount(stagedData.tableName);
    await this.stagedDataRepository.update(existingStagedDataId, {
      rowCount: newRowCount
    });

    return { inserted, updated, deleted, totalRows: newRowCount };
  }

  private buildKey(row: any, primaryKeys: string[]): string {
    return primaryKeys.map(pk => row[pk]).join('|');
  }

  private async updateRow(table: string, row: any, primaryKeys: string[]) {
    const setClause = Object.keys(row)
      .filter(col => !primaryKeys.includes(col))
      .map(col => `${this.quoteIdent(col)} = ${this.quoteLiteral(row[col])}`)
      .join(', ');

    const whereClause = primaryKeys
      .map(pk => `${this.quoteIdent(pk)} = ${this.quoteLiteral(row[pk])}`)
      .join(' AND ');

    await this.dataSource.query(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`
    );
  }
}
```

**API Endpoints**:
```typescript
POST   /api/ingestion-v2/incremental/:stagedDataId    # Perform incremental update
POST   /api/ingestion-v2/incremental/preview           # Preview changes before applying
```

---

### 7. REST API Integration

**User Flow**:
1. Navigate to Ingestion → API Import
2. Configure API:
   - Endpoint URL
   - Method (GET/POST)
   - Authentication (None, Bearer, API Key, OAuth2)
   - Headers
   - Request body (for POST)
3. Configure response parsing:
   - JSON path to data array
   - Pagination settings (if applicable)
4. Preview data
5. Execute import or schedule

**Backend Implementation**:

```typescript
// api-importer.ts
export class ApiImporter extends BaseImporter {
  async import(config: ApiImportConfig): Promise<ImportResult> {
    let allData: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      // 1. Build request
      const url = this.buildUrl(config.url, page, config.pagination);
      const headers = this.buildHeaders(config.auth, config.headers);
      const body = config.method === 'POST' ? config.body : undefined;

      // 2. Make request
      const response = await axios({
        method: config.method,
        url,
        headers,
        data: body
      });

      // 3. Extract data using JSON path
      const data = this.extractData(response.data, config.dataPath);
      allData = allData.concat(data);

      // 4. Check pagination
      if (config.pagination) {
        hasMore = this.hasMorePages(response, data, config.pagination);
        page++;

        if (page > config.pagination.maxPages) break;
      } else {
        hasMore = false;
      }

      // Rate limiting
      if (hasMore) {
        await this.delay(config.rateLimitMs || 1000);
      }
    }

    // 5. Import to staging
    return await this.importToStaging(allData, config);
  }

  private extractData(responseData: any, jsonPath: string): any[] {
    // Use JSONPath library to extract data
    const result = jp.query(responseData, jsonPath);
    return Array.isArray(result) ? result : [result];
  }

  private hasMorePages(response: any, data: any[], pagination: PaginationConfig): boolean {
    switch (pagination.type) {
      case 'offset':
        return data.length === pagination.pageSize;
      case 'cursor':
        return !!this.extractData(response.data, pagination.cursorPath);
      case 'link':
        return !!response.headers.link && response.headers.link.includes('rel="next"');
      default:
        return false;
    }
  }

  private buildHeaders(auth: AuthConfig, customHeaders: any): any {
    const headers: any = { ...customHeaders };

    switch (auth?.type) {
      case 'bearer':
        headers.Authorization = `Bearer ${auth.token}`;
        break;
      case 'api_key':
        if (auth.location === 'header') {
          headers[auth.keyName] = auth.keyValue;
        }
        break;
      case 'oauth2':
        // OAuth2 token exchange would be handled separately
        headers.Authorization = `Bearer ${auth.accessToken}`;
        break;
    }

    return headers;
  }
}
```

**API Config Example**:

```json
{
  "name": "Census API Import",
  "url": "https://api.census.gov/data/2020/acs/acs5",
  "method": "GET",
  "auth": {
    "type": "api_key",
    "location": "query",
    "keyName": "key",
    "keyValue": "encrypted-api-key"
  },
  "headers": {
    "Accept": "application/json"
  },
  "dataPath": "$[*]",
  "pagination": {
    "type": "offset",
    "pageSize": 100,
    "maxPages": 10
  },
  "rateLimitMs": 1000
}
```

---

### 8. Data Quality Validation

**Validation Rule Types**:

1. **Required**: Column must not be null/empty
2. **Data Type**: Value must match expected type
3. **Range**: Numeric value within min/max
4. **Regex**: String matches pattern
5. **Unique**: No duplicate values in column
6. **Foreign Key**: Value exists in another table
7. **Custom**: User-defined SQL expression

**Configuration Format**:

```json
{
  "rules": [
    {
      "column": "email",
      "type": "required",
      "severity": "error"
    },
    {
      "column": "email",
      "type": "regex",
      "pattern": "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
      "severity": "error",
      "message": "Invalid email format"
    },
    {
      "column": "age",
      "type": "range",
      "min": 0,
      "max": 120,
      "severity": "warning"
    },
    {
      "column": "user_id",
      "type": "unique",
      "severity": "error"
    },
    {
      "column": "status",
      "type": "custom",
      "expression": "status IN ('active', 'inactive', 'pending')",
      "severity": "error"
    }
  ],
  "onValidationFailure": "reject"  // or "accept_with_warnings"
}
```

**Backend Implementation**:

```typescript
// validation.service.ts
export class ValidationService {
  async validateData(
    data: any[],
    config: ValidationConfig
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const validRows: any[] = [];
    const invalidRows: any[] = [];

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const rowErrors: ValidationError[] = [];

      for (const rule of config.rules) {
        const result = await this.validateRule(row, rule, rowIndex);

        if (!result.valid) {
          const error: ValidationError = {
            rowIndex,
            column: rule.column,
            rule: rule.type,
            message: result.message || rule.message,
            severity: rule.severity,
            value: row[rule.column]
          };

          rowErrors.push(error);

          if (rule.severity === 'error') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }
      }

      if (rowErrors.some(e => e.severity === 'error')) {
        invalidRows.push({ ...row, _errors: rowErrors });
      } else {
        validRows.push(row);
      }
    }

    return {
      valid: errors.length === 0,
      totalRows: data.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      errors,
      warnings,
      validData: validRows,
      invalidData: invalidRows
    };
  }

  private async validateRule(
    row: any,
    rule: ValidationRule,
    rowIndex: number
  ): Promise<{ valid: boolean; message?: string }> {
    const value = row[rule.column];

    switch (rule.type) {
      case 'required':
        return {
          valid: value !== null && value !== undefined && value !== '',
          message: `${rule.column} is required`
        };

      case 'data_type':
        return this.validateDataType(value, rule.expectedType, rule.column);

      case 'range':
        if (typeof value !== 'number') {
          return { valid: false, message: `${rule.column} must be a number` };
        }
        const inRange = value >= rule.min && value <= rule.max;
        return {
          valid: inRange,
          message: `${rule.column} must be between ${rule.min} and ${rule.max}`
        };

      case 'regex':
        const regex = new RegExp(rule.pattern);
        return {
          valid: regex.test(String(value)),
          message: rule.message || `${rule.column} format is invalid`
        };

      case 'unique':
        // This requires checking all rows, handled separately
        return { valid: true };

      default:
        return { valid: true };
    }
  }
}
```

**Frontend Component**:

```typescript
// ValidationRuleBuilder.tsx
const ValidationRuleBuilder = ({ onChange }) => {
  const [rules, setRules] = useState<ValidationRule[]>([]);

  const addRule = () => {
    setRules([...rules, {
      column: '',
      type: 'required',
      severity: 'error'
    }]);
  };

  return (
    <div className="space-y-4">
      <Button onClick={addRule}>Add Validation Rule</Button>

      {rules.map((rule, idx) => (
        <Card key={idx}>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={rule.column}
                onValueChange={(col) => updateRule(idx, 'column', col)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map(col => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.type}
                onValueChange={(type) => updateRule(idx, 'type', type)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="data_type">Data Type</SelectItem>
                  <SelectItem value="range">Range</SelectItem>
                  <SelectItem value="regex">Regex Pattern</SelectItem>
                  <SelectItem value="unique">Unique</SelectItem>
                </SelectContent>
              </Select>

              {/* Dynamic config based on rule type */}
              {rule.type === 'range' && (
                <>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={rule.min}
                    onChange={(e) => updateRule(idx, 'min', e.target.value)}
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={rule.max}
                    onChange={(e) => updateRule(idx, 'max', e.target.value)}
                  />
                </>
              )}

              <Select
                value={rule.severity}
                onValueChange={(sev) => updateRule(idx, 'severity', sev)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="error">Error (Reject)</SelectItem>
                  <SelectItem value="warning">Warning (Accept)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              onClick={() => removeRule(idx)}
            >
              Remove Rule
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
```

---

### 9. FTP/SFTP Import

**User Flow**:
1. Navigate to Ingestion → FTP/SFTP Import
2. Configure server:
   - Host, Port
   - Protocol (FTP/SFTP)
   - Authentication (username/password or SSH key)
3. Browse remote directory
4. Select file(s) to import
5. Schedule or execute immediately

**Backend Implementation**:

```typescript
// ftp-importer.ts
import * as Client from 'ssh2-sftp-client';
import * as FtpClient from 'ftp';

export class FtpImporter extends BaseImporter {
  async import(config: FtpImportConfig): Promise<ImportResult> {
    const client = config.protocol === 'sftp'
      ? new Client()
      : new FtpClient();

    try {
      // 1. Connect
      await this.connect(client, config);

      // 2. List files if pattern provided
      const files = config.filePattern
        ? await this.listFiles(client, config.remotePath, config.filePattern)
        : [config.remotePath];

      const results: ImportResult[] = [];

      // 3. Download and import each file
      for (const file of files) {
        const localPath = await this.downloadFile(client, file);
        const result = await this.importFile(localPath, config);
        results.push(result);
      }

      return this.mergeResults(results);

    } finally {
      await client.end();
    }
  }

  private async connect(client: any, config: FtpImportConfig) {
    if (config.protocol === 'sftp') {
      await client.connect({
        host: config.host,
        port: config.port || 22,
        username: config.username,
        password: config.password,
        privateKey: config.privateKey
      });
    } else {
      await new Promise((resolve, reject) => {
        client.connect({
          host: config.host,
          port: config.port || 21,
          user: config.username,
          password: config.password
        });
        client.on('ready', resolve);
        client.on('error', reject);
      });
    }
  }

  private async listFiles(
    client: any,
    remotePath: string,
    pattern: string
  ): Promise<string[]> {
    const list = await client.list(remotePath);
    const regex = new RegExp(pattern);
    return list
      .filter((file: any) => regex.test(file.name))
      .map((file: any) => `${remotePath}/${file.name}`);
  }
}
```

---

### 10. Data Catalog Federation (CKAN)

**User Flow**:
1. Navigate to Ingestion → Data Catalog Import
2. Configure catalog:
   - Catalog URL (e.g., https://catalog.data.gov)
   - API key (if required)
3. Search or browse datasets
4. Preview dataset
5. Import selected dataset

**Backend Implementation**:

```typescript
// ckan-importer.ts
export class CkanImporter extends BaseImporter {
  async searchDatasets(catalogUrl: string, query: string): Promise<any[]> {
    const response = await axios.get(`${catalogUrl}/api/3/action/package_search`, {
      params: { q: query, rows: 100 }
    });
    return response.data.result.results;
  }

  async getDatasetResources(catalogUrl: string, datasetId: string): Promise<any[]> {
    const response = await axios.get(`${catalogUrl}/api/3/action/package_show`, {
      params: { id: datasetId }
    });
    return response.data.result.resources;
  }

  async import(config: CkanImportConfig): Promise<ImportResult> {
    // 1. Get dataset info
    const resources = await this.getDatasetResources(config.catalogUrl, config.datasetId);

    // 2. Find downloadable resource
    const resource = resources.find(r =>
      ['CSV', 'JSON', 'XLSX'].includes(r.format.toUpperCase())
    );

    if (!resource) {
      throw new Error('No downloadable resource found');
    }

    // 3. Import using URL importer
    return await this.urlImporter.import({
      url: resource.url,
      name: resource.name,
      ...config
    });
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Goals**: Database schema, base infrastructure

1. Create database migrations for new tables
2. Create base entities (ImportSource, ScheduledImport, etc.)
3. Implement BaseImporter abstract class
4. Create ingestion-v2 module structure
5. Set up encryption for import source configs

**Deliverables**:
- Database schema ready
- Module scaffolding complete
- Base infrastructure in place

### Phase 2: Database Direct Import (Weeks 3-4)

**Goals**: First concrete importer

1. Implement DatabaseImporter
2. Create API endpoints
3. Build frontend wizard
4. Add preview functionality
5. Test with PostgreSQL and MySQL

**Deliverables**:
- Users can import data from connected databases
- Preview before import
- Support for column selection and filtering

### Phase 3: URL Import & Bulk Upload (Week 5)

**Goals**: File-based imports

1. Implement UrlImporter
2. Enhance file upload to support multiple files
3. Create bulk upload UI with progress tracking
4. Add file merge/separate options

**Deliverables**:
- URL-based imports working
- Multiple file upload with progress bars
- File format auto-detection

### Phase 4: Scheduled Imports (Weeks 6-7)

**Goals**: Automation

1. Implement ImportSchedulerService with cron support
2. Create scheduled import CRUD
3. Build scheduling UI (cron builder)
4. Implement email notifications
5. Add execution history tracking

**Deliverables**:
- Recurring imports on schedule
- Email notifications
- Execution history visible in UI

### Phase 5: Data Transformation (Weeks 8-9)

**Goals**: Data cleaning and preparation

1. Implement all transformer types
2. Create transformation builder UI
3. Add transformation templates
4. Test transformation pipeline

**Deliverables**:
- Full transformation capabilities
- Visual transformation builder
- Reusable templates

### Phase 6: Incremental Updates (Week 10)

**Goals**: Delta imports

1. Implement IncrementalImporter
2. Add upsert logic
3. Create incremental config UI
4. Performance testing with large datasets

**Deliverables**:
- Incremental updates working
- Upsert based on primary keys
- Delete missing rows option

### Phase 7: REST API Integration (Weeks 11-12)

**Goals**: External API imports

1. Implement ApiImporter
2. Add pagination support (offset, cursor, link)
3. Implement OAuth2 flow
4. Create API config UI with JSON path selector
5. Test with public APIs (census, open data)

**Deliverables**:
- REST API imports working
- Multiple auth methods supported
- Pagination handling

### Phase 8: Data Quality Validation (Weeks 13-14)

**Goals**: Ensure data quality

1. Implement all validator types
2. Create validation rule builder UI
3. Add validation result preview
4. Implement reject/accept with warnings logic

**Deliverables**:
- Comprehensive validation
- Visual rule builder
- Validation error reports

### Phase 9: FTP/SFTP (Week 15)

**Goals**: Legacy system integration

1. Implement FtpImporter
2. Add SSH key authentication
3. Create FTP browser UI
4. Test with FTP/SFTP servers

**Deliverables**:
- FTP/SFTP imports working
- File pattern matching
- Secure authentication

### Phase 10: CKAN Integration (Week 16)

**Goals**: Data catalog federation

1. Implement CkanImporter
2. Create catalog search UI
3. Add dataset browser
4. Test with data.gov and other CKAN catalogs

**Deliverables**:
- CKAN catalog integration
- Dataset search and preview
- One-click import from catalogs

### Phase 11: Testing & Polish (Weeks 17-18)

**Goals**: Production readiness

1. Comprehensive testing of all import methods
2. Performance optimization
3. Security audit
4. Documentation
5. Error handling improvements
6. UI/UX polish

**Deliverables**:
- Full test coverage
- Performance benchmarks
- Complete documentation
- Production-ready system

---

## Frontend Pages & Components

### New Pages

```
packages/frontend/app/ingestion-v2/
├── page.tsx                           # Main ingestion hub
├── database-import/page.tsx           # Database import wizard
├── url-import/page.tsx                # URL import form
├── api-import/page.tsx                # API config and import
├── ftp-import/page.tsx                # FTP/SFTP browser
├── catalog-import/page.tsx            # CKAN catalog browser
├── schedules/page.tsx                 # Manage scheduled imports
└── executions/page.tsx                # Import execution history
```

### Component Structure

```
packages/frontend/components/IngestionV2/
├── ImportSourceManager/
│   ├── ImportSourceList.tsx           # List all import sources
│   ├── ImportSourceCard.tsx           # Display source info
│   └── CreateImportSourceModal.tsx    # Create new source
├── DatabaseImport/
│   ├── DatabaseImportWizard.tsx       # Multi-step wizard
│   ├── ConnectionSelector.tsx         # Select source connection
│   ├── SchemaTableBrowser.tsx         # Browse schemas/tables
│   ├── ColumnSelector.tsx             # Select columns
│   ├── FilterBuilder.tsx              # WHERE clause builder
│   └── ImportConfiguration.tsx        # Name, schedule, etc.
├── UrlImport/
│   ├── UrlImportForm.tsx              # URL and auth config
│   ├── AuthenticationConfig.tsx       # Auth method selector
│   └── UrlPreview.tsx                 # Preview data from URL
├── BulkUpload/
│   ├── BulkFileUploader.tsx           # Multi-file drag-and-drop
│   ├── FileProgressList.tsx           # Upload progress for each
│   └── FileMergeOptions.tsx           # Merge or separate files
├── Scheduling/
│   ├── ScheduleBuilder.tsx            # Configure schedule
│   ├── CronBuilder.tsx                # Visual cron editor
│   ├── ScheduleList.tsx               # List all schedules
│   └── ExecutionHistory.tsx           # Execution logs
├── Transformation/
│   ├── TransformationBuilder.tsx      # Add/remove transformations
│   ├── TransformationCard.tsx         # Configure one transformation
│   ├── ColumnMappingConfig.tsx        # Rename columns
│   ├── RowFilterConfig.tsx            # Filter conditions
│   ├── CalculatedColumnConfig.tsx     # Add computed columns
│   └── TransformationTemplates.tsx    # Load/save templates
├── Validation/
│   ├── ValidationRuleBuilder.tsx      # Add/remove rules
│   ├── ValidationRuleCard.tsx         # Configure one rule
│   ├── ValidationResult.tsx           # Show validation errors
│   └── ValidationTemplates.tsx        # Load/save rule sets
└── ApiImport/
    ├── ApiConfigForm.tsx              # Endpoint, auth, headers
    ├── JsonPathSelector.tsx           # Visual JSON path builder
    ├── PaginationConfig.tsx           # Pagination settings
    └── ApiPreview.tsx                 # Test API and preview data
```

---

## Dependencies

### Backend Dependencies

Add to `packages/backend/package.json`:

```json
{
  "dependencies": {
    "@nestjs/schedule": "^4.0.0",       // Cron scheduling
    "node-cron": "^3.0.2",              // Cron parsing
    "ssh2-sftp-client": "^9.1.0",       // SFTP client
    "ftp": "^0.3.10",                   // FTP client
    "jsonpath-plus": "^7.2.0",          // JSON path queries
    "papaparse": "^5.4.1"               // CSV parsing (already have?)
  }
}
```

### Frontend Dependencies

Add to `packages/frontend/package.json`:

```json
{
  "dependencies": {
    "react-dropzone": "^14.2.3",        // File drag-and-drop
    "cron-parser": "^4.8.1",            // Parse cron expressions
    "react-cron-generator": "^2.0.6"    // Visual cron builder
  }
}
```

---

## Security Considerations

### 1. Credential Storage
- All import source configs encrypted with AES-256-GCM
- OAuth tokens stored encrypted
- SSH private keys encrypted
- API keys never logged

### 2. Input Validation
- Sanitize all URLs before fetching
- Validate cron expressions
- SQL injection prevention in WHERE clauses
- File type validation

### 3. Rate Limiting
- API imports: 10 requests/min per organization
- Database imports: 5 requests/min
- URL imports: 20 requests/min
- Scheduled imports: Max 100 active per organization

### 4. Resource Protection
- Import timeout: 10 minutes
- Max file size: 500MB for URL downloads
- Max API response size: 100MB
- Connection pooling for database imports

### 5. Organization Isolation
- All import sources scoped to organization
- No cross-org data access
- Scheduled imports isolated by organization

### 6. Audit Logging
- Log all import executions
- Track who created/modified import sources
- Log authentication failures
- Track data access patterns

---

## Environment Variables

Add to `.env` and `.env.example`:

```bash
# Import Configuration
IMPORT_TIMEOUT_MS=600000                    # 10 minutes
IMPORT_MAX_FILE_SIZE_MB=500                # Max download size
IMPORT_MAX_ROWS=1000000                    # Max rows per import
IMPORT_CONCURRENT_LIMIT=5                  # Max concurrent imports

# Scheduled Imports
SCHEDULER_CHECK_INTERVAL_MS=60000          # Check for due jobs every minute
SCHEDULER_MAX_RETRIES=3                    # Retry failed imports
SCHEDULER_RETENTION_DAYS=90                # Keep execution history

# API Imports
API_DEFAULT_TIMEOUT_MS=30000               # 30 seconds
API_MAX_PAGES=100                          # Max pagination pages
API_RATE_LIMIT_MS=1000                     # Min time between requests

# FTP/SFTP
FTP_CONNECTION_TIMEOUT_MS=10000            # 10 seconds
FTP_MAX_FILE_SIZE_MB=500

# Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
NOTIFICATION_FROM_EMAIL=noreply@datagate.com
```

---

## Success Criteria

### Phase 1
- ✅ Users can import data directly from connected databases
- ✅ Column selection and row filtering working
- ✅ Preview data before import
- ✅ Bulk file upload with progress tracking
- ✅ URL-based imports for CSV/JSON/Excel

### Phase 2
- ✅ Scheduled imports running on cron schedules
- ✅ Email notifications on success/failure
- ✅ Execution history visible in UI
- ✅ Data transformations applied during import
- ✅ Transformation templates for reuse
- ✅ Incremental updates with upsert logic

### Additional Features
- ✅ REST API imports with OAuth2 support
- ✅ Pagination handling (offset, cursor, link)
- ✅ Data quality validation with visual rule builder
- ✅ Validation error reports
- ✅ FTP/SFTP imports with SSH key auth
- ✅ CKAN catalog federation and dataset search

### Non-Functional
- ✅ All import methods handle 100K+ rows efficiently
- ✅ Security audit passed
- ✅ Rate limiting prevents abuse
- ✅ Comprehensive error handling
- ✅ Full test coverage (>80%)
- ✅ Documentation complete

---

## Future Enhancements (Post Phase 4)

- **Google Sheets Integration**: OAuth2 + real-time sync
- **Cloud Storage**: AWS S3, GCS, Azure Blob
- **Streaming Data**: Kafka, webhooks
- **Web Scraping**: Extract HTML tables
- **Email Integration**: Import attachments
- **Data Versioning**: Track changes over time
- **Data Lineage**: Track data sources and transformations
- **Advanced Transformations**: SQL-based, Python scripts
- **Machine Learning**: Auto-detect data quality issues
- **Collaborative Scheduling**: Team approval workflows

---

## Estimated Timeline

- **Phase 1** (Foundation): 2 weeks
- **Phase 2** (Database Import): 2 weeks
- **Phase 3** (URL & Bulk): 1 week
- **Phase 4** (Scheduling): 2 weeks
- **Phase 5** (Transformation): 2 weeks
- **Phase 6** (Incremental): 1 week
- **Phase 7** (REST API): 2 weeks
- **Phase 8** (Validation): 2 weeks
- **Phase 9** (FTP/SFTP): 1 week
- **Phase 10** (CKAN): 1 week
- **Phase 11** (Testing & Polish): 2 weeks

**Total**: ~18 weeks (~4.5 months)

---

## Next Steps

1. Review this plan and prioritize features
2. Confirm technical approach for each feature
3. Start with Phase 1 (database schema and foundation)
4. Implement Phase 2 (Database Direct Import) as first concrete feature
5. Iterate based on user feedback

Would you like me to start implementing any specific phase?
