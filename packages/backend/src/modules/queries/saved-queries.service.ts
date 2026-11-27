import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { QueryHistory, SavedQuery } from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import {
  QueryTemplateService,
  ParamDef,
} from './query-template.service';
import {
  CreateSavedQueryDto,
  UpdateSavedQueryDto,
} from './dto/saved-query.dto';
import { QueryResultDto } from './dto/query-result.dto';

@Injectable()
export class SavedQueriesService {
  private readonly queryTimeout: number;
  private readonly maxResultRows: number;

  constructor(
    @InjectRepository(SavedQuery)
    private readonly repo: Repository<SavedQuery>,
    @InjectRepository(QueryHistory)
    private readonly historyRepo: Repository<QueryHistory>,
    private readonly templateService: QueryTemplateService,
    private readonly connectionsService: ConnectionsService,
    private readonly configService: ConfigService,
  ) {
    this.queryTimeout = this.configService.get<number>(
      'QUERY_TIMEOUT_MS',
      30000,
    );
    this.maxResultRows = this.configService.get<number>(
      'MAX_RESULT_ROWS',
      10000,
    );
  }

  async list(organizationId: string): Promise<SavedQuery[]> {
    return this.repo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  async getById(id: string, organizationId: string): Promise<SavedQuery> {
    const sq = await this.repo.findOne({ where: { id, organizationId } });
    if (!sq) {
      throw new NotFoundException(`Saved query ${id} not found`);
    }
    return sq;
  }

  async create(
    dto: CreateSavedQueryDto,
    organizationId: string,
    userId: string,
  ): Promise<SavedQuery> {
    const parameters = (dto.parameters ?? []) as ParamDef[];
    this.assertParameterDefs(parameters);

    const entity = this.repo.create({
      id: uuidv4(),
      organizationId,
      createdBy: userId,
      connectionId: dto.connectionId,
      name: dto.name,
      description: dto.description ?? null,
      sql: dto.sql,
      parameters,
      cacheTtlSeconds: dto.cacheTtlSeconds ?? 300,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateSavedQueryDto,
    organizationId: string,
  ): Promise<SavedQuery> {
    const sq = await this.getById(id, organizationId);

    if (dto.parameters !== undefined) {
      this.assertParameterDefs(dto.parameters as ParamDef[]);
      sq.parameters = dto.parameters as ParamDef[];
    }
    if (dto.name !== undefined) sq.name = dto.name;
    if (dto.description !== undefined) sq.description = dto.description;
    if (dto.connectionId !== undefined) sq.connectionId = dto.connectionId;
    if (dto.sql !== undefined) sq.sql = dto.sql;
    if (dto.cacheTtlSeconds !== undefined) {
      sq.cacheTtlSeconds = dto.cacheTtlSeconds;
    }

    return this.repo.save(sq);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const sq = await this.getById(id, organizationId);
    await this.repo.remove(sq);
  }

  async execute(
    id: string,
    parameters: Record<string, unknown>,
    organizationId: string,
  ): Promise<QueryResultDto> {
    const sq = await this.getById(id, organizationId);
    const queryId = uuidv4();
    const startTime = Date.now();

    // Template engine validates parameter values and produces bound SQL.
    // Any BadRequestException it throws surfaces as a 400 with a clear message.
    const allowed = await this.resolveAllowedIdentifiers(
      sq.connectionId,
      organizationId,
    );
    const rendered = this.templateService.render(
      sq.sql,
      sq.parameters,
      parameters,
      allowed,
    );

    const driver = await this.connectionsService.getDriver(
      sq.connectionId,
      organizationId,
    );

    try {
      const result = await this.executeWithTimeout(
        driver.query(rendered.sql, rendered.bindings),
        this.queryTimeout,
      );

      if (result.rows.length > this.maxResultRows) {
        result.rows = result.rows.slice(0, this.maxResultRows);
      }

      const executionTime = Date.now() - startTime;

      await this.logHistory({
        id: queryId,
        connectionId: sq.connectionId,
        organizationId,
        sqlQuery: rendered.sql,
        executionTimeMs: executionTime,
        rowCount: result.rowCount,
        status: 'success',
      });

      return {
        id: queryId,
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields,
        executionTimeMs: executionTime,
        status: 'success',
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      await this.logHistory({
        id: queryId,
        connectionId: sq.connectionId,
        organizationId,
        sqlQuery: rendered.sql,
        executionTimeMs: executionTime,
        rowCount: 0,
        status: 'error',
        errorMessage: error.message,
      });

      throw new BadRequestException(
        `Query execution failed: ${error.message}`,
      );
    } finally {
      await driver.disconnect();
    }
  }

  private assertParameterDefs(defs: ParamDef[]): void {
    const validTypes = new Set([
      'string',
      'number',
      'boolean',
      'date',
      'date_range',
      'select',
      'multi_select',
    ]);
    const seen = new Set<string>();
    for (const d of defs) {
      if (!d || typeof d.name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(d.name)) {
        throw new BadRequestException(
          `Invalid parameter name "${d?.name}"; must match [a-zA-Z_][a-zA-Z0-9_]*`,
        );
      }
      if (seen.has(d.name)) {
        throw new BadRequestException(`Duplicate parameter "${d.name}"`);
      }
      seen.add(d.name);
      if (!validTypes.has(d.type)) {
        throw new BadRequestException(
          `Invalid type "${d.type}" for parameter "${d.name}"`,
        );
      }
      if (typeof d.required !== 'boolean') {
        throw new BadRequestException(
          `Parameter "${d.name}" missing required flag`,
        );
      }
      if (d.default !== undefined) {
        this.templateService.validateValue(d, d.default);
      }
    }
  }

  /**
   * Identifier-mode tokens like {{!table}} require a whitelist of allowed
   * names. Populating this from live schema discovery on every execute would
   * re-introspect the remote DB per request — too slow. Future work caches
   * schema per (connectionId, organizationId) and fills this set.
   *
   * Until then, identifier-mode tokens in saved SQL always 400 with
   * "not in allow-list". Value-mode tokens (the common case) are unaffected.
   */
  private async resolveAllowedIdentifiers(
    _connectionId: string,
    _organizationId: string,
  ): Promise<Set<string>> {
    return new Set();
  }

  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error('Query timeout exceeded')),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private async logHistory(data: {
    id: string;
    connectionId: string | null;
    organizationId: string;
    sqlQuery: string;
    executionTimeMs: number;
    rowCount: number;
    status: string;
    errorMessage?: string;
  }): Promise<void> {
    const entity = this.historyRepo.create(data);
    await this.historyRepo.save(entity);
  }
}
