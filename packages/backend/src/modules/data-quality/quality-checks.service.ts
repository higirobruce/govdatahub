import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { QualityCheck, QualityCheckRun } from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';

export class CreateQualityCheckDto {
  connectionId: string;
  schemaName: string;
  tableName: string;
  columnName?: string;
  name: string;
  description?: string;
  checkType: string;
  config: Record<string, any>;
}

export class UpdateQualityCheckDto {
  name?: string;
  description?: string;
  config?: Record<string, any>;
  status?: 'active' | 'inactive';
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
