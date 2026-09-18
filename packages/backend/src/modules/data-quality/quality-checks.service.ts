import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsIn,
  MaxLength,
} from 'class-validator';
import {
  QualityCheck,
  QualityCheckRun,
  ColumnProfile,
  MatchProject,
  MatchRun,
  MatchEntity,
} from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { ProfilingService } from './profiling.service';
import { AiService } from '../ai/ai.service';
import { AiAuditService } from '../ai/ai-audit.service';
import { SettingsService } from '../settings/settings.service';
import { SuggestChecksDto } from './dto/suggest-checks.dto';

export class CreateQualityCheckDto {
  @IsString() @IsNotEmpty() connectionId: string;
  @IsString() @IsNotEmpty() @MaxLength(256) schemaName: string;
  @IsString() @IsNotEmpty() @MaxLength(256) tableName: string;
  @IsOptional() @IsString() @MaxLength(256) columnName?: string;
  @IsString() @IsNotEmpty() @MaxLength(256) name: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString()
  @IsIn(['not_null', 'unique', 'min_rows', 'max_rows', 'freshness', 'custom_sql', 'no_duplicates'])
  checkType: string;
  @IsObject() config: Record<string, any>;
}

export class UpdateQualityCheckDto {
  @IsOptional() @IsString() @MaxLength(256) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsObject() config?: Record<string, any>;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}

/** The only checkTypes an AI suggestion is ever allowed to produce — never custom_sql. */
const ALLOWED_SUGGESTION_CHECK_TYPES = new Set([
  'not_null',
  'unique',
  'min_rows',
  'max_rows',
  'freshness',
]);

export interface SuggestedCheck {
  checkType: string;
  columnName?: string;
  config: Record<string, any>;
  rationale: string;
}

function quoteId(dbType: string, name: string): string {
  if (dbType === 'mysql') return `\`${name.replace(/`/g, '')}\``;
  if (dbType === 'sqlserver') return `[${name.replace(/[\[\]]/g, '')}]`;
  return `"${name.replace(/"/g, '')}"`;
}

@Injectable()
export class QualityChecksService {
  private readonly logger = new Logger(QualityChecksService.name);

  constructor(
    @InjectRepository(QualityCheck)
    private checksRepo: Repository<QualityCheck>,
    @InjectRepository(QualityCheckRun)
    private runsRepo: Repository<QualityCheckRun>,
    private connectionsService: ConnectionsService,
    private profilingService: ProfilingService,
    private aiService: AiService,
    private aiAudit: AiAuditService,
    private settingsService: SettingsService,
    // Read-only. Deliberately NOT MatchRunService: a quality check must be
    // able to read a match project's latest completed run, but must never
    // be able to start one (that can be a two-hour job).
    @InjectRepository(MatchProject)
    private matchProjectRepo: Repository<MatchProject>,
    @InjectRepository(MatchRun)
    private matchRunRepo: Repository<MatchRun>,
    @InjectRepository(MatchEntity)
    private matchEntityRepo: Repository<MatchEntity>,
  ) {}

  async create(dto: CreateQualityCheckDto, organizationId: string): Promise<QualityCheck> {
    const check = this.checksRepo.create({
      id: uuidv4(),
      organizationId,
      connectionId: dto.connectionId,
      schemaName: dto.schemaName,
      tableName: dto.tableName,
      columnName: dto.columnName ?? null,
      name: dto.name,
      description: dto.description ?? null,
      checkType: dto.checkType as any,
      config: dto.config,
      status: 'active',
    });
    return this.checksRepo.save(check);
  }

  async findAll(
    organizationId: string,
    filters?: { connectionId?: string; schemaName?: string; tableName?: string },
  ): Promise<QualityCheck[]> {
    const where: any = { organizationId };
    if (filters?.connectionId) where.connectionId = filters.connectionId;
    if (filters?.schemaName) where.schemaName = filters.schemaName;
    if (filters?.tableName) where.tableName = filters.tableName;
    return this.checksRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, organizationId: string): Promise<QualityCheck> {
    const check = await this.checksRepo.findOne({ where: { id, organizationId } });
    if (!check) throw new NotFoundException(`Quality check ${id} not found`);
    return check;
  }

  async update(id: string, dto: UpdateQualityCheckDto, organizationId: string): Promise<QualityCheck> {
    const check = await this.findOne(id, organizationId);
    if (dto.name !== undefined) check.name = dto.name;
    if (dto.description !== undefined) check.description = dto.description ?? null;
    if (dto.config !== undefined) check.config = dto.config;
    if (dto.status !== undefined) check.status = dto.status;
    return this.checksRepo.save(check);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const result = await this.checksRepo.delete({ id, organizationId });
    if (result.affected === 0) throw new NotFoundException(`Quality check ${id} not found`);
  }

  async getRunHistory(checkId: string, organizationId: string): Promise<QualityCheckRun[]> {
    await this.findOne(checkId, organizationId); // ownership check
    return this.runsRepo.find({
      where: { checkId },
      order: { ranAt: 'DESC' },
      take: 50,
    });
  }

  async runCheck(id: string, organizationId: string): Promise<QualityCheckRun> {
    const check = await this.findOne(id, organizationId);

    if (check.status === 'inactive') {
      throw new BadRequestException('Cannot run an inactive quality check.');
    }

    // no_duplicates never touches a source connection: it reads the match
    // project's latest completed run from the metadata DB directly, so it
    // skips the connection/driver machinery below entirely.
    if (check.checkType === 'no_duplicates') {
      return this.runNoDuplicatesCheck(check, organizationId);
    }

    const { connection } = await this.connectionsService.getConnectionConfig(
      check.connectionId,
      organizationId,
    );
    const dbType = connection.type;

    if (dbType === 'mongodb') {
      throw new BadRequestException('Quality checks are not supported for MongoDB connections in this version.');
    }

    const run = this.runsRepo.create({
      id: uuidv4(),
      checkId: check.id,
      organizationId,
      status: 'error',
      ranAt: new Date(),
    });

    const start = Date.now();
    const driver = await this.connectionsService.getDriver(check.connectionId, organizationId);

    try {
      const { sql, expectedDesc } = this.buildCheckSql(check, dbType);
      const result = await driver.query(sql);
      const rawValue = result.rows[0] ? Object.values(result.rows[0])[0] : null;
      const actualValue = rawValue != null ? Number(rawValue) : null;

      run.actualValue = actualValue;
      run.expectedDesc = expectedDesc;
      run.status = this.evaluate(check, actualValue) ? 'pass' : 'fail';
    } catch (err: any) {
      this.logger.warn(`Quality check ${id} failed: ${err.message}`);
      run.status = 'error';
      run.errorMessage = err.message;
    } finally {
      run.durationMs = Date.now() - start;
      await driver.disconnect().catch(() => {});
    }

    const saved = await this.runsRepo.save(run);

    // Update check's last-run summary
    check.lastRunAt = saved.ranAt;
    check.lastRunStatus = saved.status;
    check.lastRunValue = saved.actualValue ?? null;
    await this.checksRepo.save(check);

    return saved;
  }

  /**
   * Executes a `no_duplicates` check. Unlike every other check type, this
   * never opens a connection driver: it counts `match_entities` rows with
   * `size > 1` for the configured match project's latest completed run,
   * read directly from the metadata DB via MatchProject/MatchRun/MatchEntity.
   *
   * The three unusable states below (project in another org, project never
   * completed a run, malformed config) are all reported as `error`, not
   * `fail` — the check could not be evaluated, which is a different claim
   * from "the data has too many duplicate clusters."
   */
  private async runNoDuplicatesCheck(
    check: QualityCheck,
    organizationId: string,
  ): Promise<QualityCheckRun> {
    const run = this.runsRepo.create({
      id: uuidv4(),
      checkId: check.id,
      organizationId,
      status: 'error',
      ranAt: new Date(),
    });

    const start = Date.now();
    try {
      const actualValue = await this.countDuplicateClusters(check.config, organizationId);
      run.actualValue = actualValue;
      run.expectedDesc = `≤ ${check.config?.maxDuplicateClusters ?? 0} duplicate cluster(s)`;
      run.status = this.evaluate(check, actualValue) ? 'pass' : 'fail';
    } catch (err: any) {
      this.logger.warn(`Quality check ${check.id} (no_duplicates) failed: ${err.message}`);
      run.status = 'error';
      run.errorMessage = err.message;
    } finally {
      run.durationMs = Date.now() - start;
    }

    const saved = await this.runsRepo.save(run);

    check.lastRunAt = saved.ranAt;
    check.lastRunStatus = saved.status;
    check.lastRunValue = saved.actualValue ?? null;
    await this.checksRepo.save(check);

    return saved;
  }

  private async countDuplicateClusters(
    config: Record<string, any>,
    organizationId: string,
  ): Promise<number> {
    const matchProjectId = config?.matchProjectId;
    const maxDuplicateClusters = config?.maxDuplicateClusters;
    if (
      typeof matchProjectId !== 'string' ||
      matchProjectId.length === 0 ||
      typeof maxDuplicateClusters !== 'number'
    ) {
      throw new Error(
        'no_duplicates check requires config.matchProjectId (string) and config.maxDuplicateClusters (number)',
      );
    }

    const project = await this.matchProjectRepo.findOne({
      where: { id: matchProjectId, organizationId },
    });
    if (!project) {
      throw new Error(`Match project ${matchProjectId} was not found in this organization`);
    }

    const latestRun = await this.matchRunRepo.findOne({
      where: { projectId: project.id, organizationId, status: 'completed' },
      order: { startedAt: 'DESC' },
    });
    if (!latestRun) {
      throw new Error(`Match project ${matchProjectId} has never completed a run`);
    }

    return this.matchEntityRepo.count({
      where: { projectId: project.id, runId: latestRun.id, organizationId, size: MoreThan(1) },
    });
  }

  async runAllForTable(
    connectionId: string,
    schemaName: string,
    tableName: string,
    organizationId: string,
  ): Promise<QualityCheckRun[]> {
    const checks = await this.findAll(organizationId, { connectionId, schemaName, tableName });
    const active = checks.filter((c) => c.status === 'active');
    return Promise.all(active.map((c) => this.runCheck(c.id, organizationId)));
  }

  // ─── AI-suggested quality checks ────────────────────────────────────────────

  /**
   * Suggest quality checks for a table based on its latest column profile.
   * Requires a profile to already exist (via ProfilingService.profileTable).
   * The AI response is filtered to the 5 allowed checkTypes (never custom_sql)
   * and to column names that actually exist on the profiled table.
   */
  async suggestChecks(
    organizationId: string,
    dto: SuggestChecksDto,
    userId?: string,
  ): Promise<SuggestedCheck[]> {
    const profile = await this.profilingService.getLatestProfile(
      dto.connectionId,
      organizationId,
      dto.schemaName,
      dto.tableName,
    );

    if (!profile) {
      throw new BadRequestException('Profile the table first');
    }

    const settings = await this.settingsService.getOrganizationSettings(organizationId);
    const provider = this.aiService.getProvider(settings.aiProvider);

    const knownColumnNames = new Set(profile.columnProfiles.map((c) => c.name));
    const columnSummary = this.formatColumnProfiles(profile.columnProfiles);

    const prompt = `You are a data quality expert. Given the following column statistics for table ${dto.schemaName}.${dto.tableName} (${profile.rowCount ?? 'unknown'} rows), suggest data quality checks.

COLUMN STATISTICS:
${columnSummary}

Only suggest checks of these types: not_null, unique, min_rows, max_rows, freshness. NEVER suggest custom_sql.
Respond as JSON: {"suggestions": [{"checkType": "...", "columnName": "...", "config": {...}, "rationale": "..."}]}`;

    const promptChars = columnSummary.length;
    const startTime = Date.now();
    let result: any;
    try {
      result = await provider.generateJson(prompt, settings);
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      await this.aiAudit.log({
        organizationId,
        userId,
        feature: 'quality_suggest',
        model: settings.aiModel,
        promptChars,
        responseChars: 0,
        latencyMs,
        success: false,
        errorMessage: error.message || 'AI provider error',
        executed: false,
      });
      this.logger.error('AI provider error:', error);
      throw new BadRequestException(
        `Failed to suggest quality checks: ${error.message || 'AI provider error'}`,
      );
    }
    const latencyMs = Date.now() - startTime;

    const rawSuggestions: any[] = Array.isArray(result?.suggestions) ? result.suggestions : [];

    const suggestions: SuggestedCheck[] = rawSuggestions
      .filter((s) => s && ALLOWED_SUGGESTION_CHECK_TYPES.has(s.checkType))
      .filter((s) => s.columnName == null || knownColumnNames.has(s.columnName))
      .map((s) => ({
        checkType: s.checkType,
        columnName: s.columnName ?? undefined,
        config: s.config && typeof s.config === 'object' ? s.config : {},
        rationale: typeof s.rationale === 'string' ? s.rationale : '',
      }));

    const responseChars = JSON.stringify(suggestions).length;

    await this.aiAudit.log({
      organizationId,
      userId,
      feature: 'quality_suggest',
      model: settings.aiModel,
      promptChars,
      responseChars,
      latencyMs,
      success: true,
      executed: false,
    });

    return suggestions;
  }

  private formatColumnProfiles(columns: ColumnProfile[]): string {
    return columns
      .map((c) => {
        const parts = [`- ${c.name} (${c.dataType}): ${c.nullPercent}% null, ${c.distinctPercent}% distinct`];
        if (c.min !== undefined) parts.push(`min=${c.min}`);
        if (c.max !== undefined) parts.push(`max=${c.max}`);
        if (c.avg !== undefined) parts.push(`avg=${c.avg}`);
        if (c.stddev !== undefined) parts.push(`stddev=${c.stddev}`);
        return parts.join(', ');
      })
      .join('\n');
  }

  // ─── SQL generation ────────────────────────────────────────────────────────

  private buildCheckSql(
    check: QualityCheck,
    dbType: string,
  ): { sql: string; expectedDesc: string } {
    const q = (n: string) => quoteId(dbType, n);
    const sch = q(check.schemaName);
    const tbl = q(check.tableName);
    const from = `${sch}.${tbl}`;
    const cfg = check.config;

    switch (check.checkType) {
      case 'not_null': {
        const col = q(check.columnName!);
        return {
          sql: `SELECT (COUNT(*) - COUNT(${col})) * 100.0 / NULLIF(COUNT(*), 0) AS v FROM ${from}`,
          expectedDesc: `≤ ${cfg.maxNullPercent ?? 0}% null in ${check.columnName}`,
        };
      }
      case 'unique': {
        const col = q(check.columnName!);
        return {
          sql: `SELECT COUNT(DISTINCT ${col}) * 100.0 / NULLIF(COUNT(*), 0) AS v FROM ${from}`,
          expectedDesc: `≥ ${cfg.minDistinctPercent ?? 100}% distinct in ${check.columnName}`,
        };
      }
      case 'min_rows':
        return {
          sql: `SELECT COUNT(*) AS v FROM ${from}`,
          expectedDesc: `≥ ${cfg.minRows ?? 0} rows`,
        };
      case 'max_rows':
        return {
          sql: `SELECT COUNT(*) AS v FROM ${from}`,
          expectedDesc: `≤ ${cfg.maxRows ?? 0} rows`,
        };
      case 'freshness': {
        const tsCol = q(cfg.timestampColumn ?? check.columnName!);
        const extractFn =
          dbType === 'mysql'
            ? `TIMESTAMPDIFF(SECOND, MAX(${tsCol}), NOW()) / 3600.0`
            : dbType === 'sqlserver'
            ? `DATEDIFF(SECOND, MAX(${tsCol}), GETUTCDATE()) / 3600.0`
            : `EXTRACT(EPOCH FROM (NOW() - MAX(${tsCol}))) / 3600`;
        return {
          sql: `SELECT ${extractFn} AS v FROM ${from}`,
          expectedDesc: `≤ ${cfg.maxAgeHours ?? 24}h since last update in ${cfg.timestampColumn ?? check.columnName}`,
        };
      }
      case 'custom_sql':
        if (!cfg.sql) throw new BadRequestException('custom_sql check requires config.sql');
        return {
          sql: cfg.sql,
          expectedDesc: `${cfg.operator ?? 'gte'} ${cfg.threshold ?? 0}`,
        };
      default:
        throw new BadRequestException(`Unknown check type: ${check.checkType}`);
    }
  }

  private evaluate(check: QualityCheck, actualValue: number | null): boolean {
    if (actualValue === null) return false;
    const cfg = check.config;

    switch (check.checkType) {
      case 'not_null':
        return actualValue <= (cfg.maxNullPercent ?? 0);
      case 'unique':
        return actualValue >= (cfg.minDistinctPercent ?? 100);
      case 'min_rows':
        return actualValue >= (cfg.minRows ?? 0);
      case 'max_rows':
        return actualValue <= (cfg.maxRows ?? Infinity);
      case 'freshness':
        return actualValue <= (cfg.maxAgeHours ?? 24);
      case 'no_duplicates':
        return actualValue <= (cfg.maxDuplicateClusters ?? 0);
      case 'custom_sql': {
        const threshold = Number(cfg.threshold ?? 0);
        switch (cfg.operator) {
          case 'gt':  return actualValue > threshold;
          case 'gte': return actualValue >= threshold;
          case 'lt':  return actualValue < threshold;
          case 'lte': return actualValue <= threshold;
          case 'eq':  return actualValue === threshold;
          default:    return actualValue >= threshold;
        }
      }
      default:
        return false;
    }
  }
}
