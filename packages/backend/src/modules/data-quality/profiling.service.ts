import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TableProfile, ColumnProfile } from '../../database/entities';
import { ConnectionsService } from '../connections/connections.service';
import { ColumnInfo } from '../connections/drivers/database-driver.interface';

const NUMERIC_TYPES = new Set([
  'int', 'int2', 'int4', 'int8', 'integer', 'bigint', 'smallint', 'tinyint',
  'float', 'float4', 'float8', 'real', 'double', 'double precision',
  'numeric', 'decimal', 'number', 'money', 'smallmoney',
]);

const MAX_COLUMNS = 200;
const SAMPLE_ROWS = 100_000;

function isNumeric(type: string): boolean {
  const t = type.toLowerCase().split('(')[0].trim();
  return NUMERIC_TYPES.has(t);
}

function quoteId(dbType: string, name: string): string {
  if (dbType === 'mysql') return `\`${name.replace(/`/g, '')}\``;
  if (dbType === 'sqlserver') return `[${name.replace(/[\[\]]/g, '')}]`;
  return `"${name.replace(/"/g, '')}"`;
}

function castVarchar(dbType: string, expr: string): string {
  if (dbType === 'clickhouse') return `CAST(${expr}, 'String')`;
  if (dbType === 'bigquery') return `CAST(${expr} AS STRING)`;
  if (dbType === 'mysql') return `CAST(${expr} AS CHAR)`;
  return `CAST(${expr} AS VARCHAR)`;
}

function stddevFn(dbType: string): string {
  if (dbType === 'sqlserver') return 'STDEV';
  if (dbType === 'clickhouse') return 'stddevSamp';
  return 'STDDEV';
}

function buildBatchSql(
  dbType: string,
  schemaName: string,
  tableName: string,
  columns: ColumnInfo[],
): string {
  const q = (n: string) => quoteId(dbType, n);
  const toVarchar = (expr: string) => castVarchar(dbType, expr);
  const stddev = stddevFn(dbType);

  const fromClause =
    dbType === 'bigquery'
      ? `\`${schemaName}\`.\`${tableName}\``
      : `${q(schemaName)}.${q(tableName)}`;

  const selects: string[] = ['COUNT(*) AS "_total"'];

  for (const col of columns) {
    const c = q(col.name);
    const safe = col.name.replace(/[^a-zA-Z0-9_]/g, '_');
    selects.push(`SUM(CASE WHEN ${c} IS NULL THEN 1 ELSE 0 END) AS "${safe}__null"`);
    selects.push(`COUNT(DISTINCT ${c}) AS "${safe}__dc"`);
    selects.push(`MIN(${toVarchar(c)}) AS "${safe}__min"`);
    selects.push(`MAX(${toVarchar(c)}) AS "${safe}__max"`);
    if (isNumeric(col.type)) {
      selects.push(`AVG(CAST(${c} AS FLOAT)) AS "${safe}__avg"`);
      if (dbType !== 'sqlite') {
        selects.push(`${stddev}(CAST(${c} AS FLOAT)) AS "${safe}__stddev"`);
      }
    }
  }

  // Wrap in a sample subquery to limit scan size
  const inner =
    dbType === 'bigquery' || dbType === 'clickhouse'
      ? `SELECT * FROM ${fromClause} LIMIT ${SAMPLE_ROWS}`
      : `SELECT * FROM ${fromClause} LIMIT ${SAMPLE_ROWS}`;

  return `SELECT ${selects.join(', ')} FROM (${inner}) _s`;
}

@Injectable()
export class ProfilingService {
  private readonly logger = new Logger(ProfilingService.name);

  constructor(
    @InjectRepository(TableProfile)
    private profileRepo: Repository<TableProfile>,
    private connectionsService: ConnectionsService,
  ) {}

  async getLatestProfile(
    connectionId: string,
    organizationId: string,
    schemaName: string,
    tableName: string,
  ): Promise<TableProfile | null> {
    return this.profileRepo.findOne({
      where: { connectionId, organizationId, schemaName, tableName },
      order: { profiledAt: 'DESC' },
    });
  }

  async profileTable(
    connectionId: string,
    organizationId: string,
    schemaName: string,
    tableName: string,
  ): Promise<TableProfile> {
    // Create a placeholder row so the UI can show "running"
    const profile = this.profileRepo.create({
      id: uuidv4(),
      organizationId,
      connectionId,
      schemaName,
      tableName,
      status: 'running',
      columnProfiles: [],
    });
    await this.profileRepo.save(profile);

    const start = Date.now();

    try {
      // Get the connection type so we can build dialect-correct SQL
      const { connection } = await this.connectionsService.getConnectionConfig(
        connectionId,
        organizationId,
      );
      const dbType = connection.type;

      if (dbType === 'mongodb') {
        throw new BadRequestException(
          'Column profiling is not supported for MongoDB connections in this version.',
        );
      }

      const driver = await this.connectionsService.getDriver(connectionId, organizationId);
      try {
        const columns = await driver.getColumns(tableName, schemaName);

        if (columns.length > MAX_COLUMNS) {
          throw new BadRequestException(
            `Table has ${columns.length} columns — profiling is capped at ${MAX_COLUMNS} columns.`,
          );
        }

        const sql = buildBatchSql(dbType, schemaName, tableName, columns);
        const result = await driver.query(sql);
        const row = result.rows[0] ?? {};
        const total = Number(row['_total'] ?? 0);

        const columnProfiles: ColumnProfile[] = columns.map((col) => {
          const safe = col.name.replace(/[^a-zA-Z0-9_]/g, '_');
          const nullCount = Number(row[`${safe}__null`] ?? 0);
          const distinctCount = Number(row[`${safe}__dc`] ?? 0);
          const p: ColumnProfile = {
            name: col.name,
            dataType: col.type,
            totalRows: total,
            nullCount,
            nullPercent: total > 0 ? Math.round((nullCount / total) * 10000) / 100 : 0,
            distinctCount,
            distinctPercent: total > 0 ? Math.round((distinctCount / total) * 10000) / 100 : 0,
            min: row[`${safe}__min`] != null ? String(row[`${safe}__min`]) : undefined,
            max: row[`${safe}__max`] != null ? String(row[`${safe}__max`]) : undefined,
          };
          if (isNumeric(col.type)) {
            const avg = row[`${safe}__avg`];
            const stddev = row[`${safe}__stddev`];
            if (avg != null) p.avg = Math.round(Number(avg) * 100) / 100;
            if (stddev != null) p.stddev = Math.round(Number(stddev) * 100) / 100;
          }
          return p;
        });

        profile.status = 'success';
        profile.rowCount = total;
        profile.columnProfiles = columnProfiles;
        profile.durationMs = Date.now() - start;
        profile.profiledAt = new Date();
      } finally {
        await driver.disconnect().catch(() => {});
      }
    } catch (err: any) {
      this.logger.warn(`Profiling failed for ${schemaName}.${tableName}: ${err.message}`);
      profile.status = 'error';
      profile.errorMessage = err.message;
      profile.durationMs = Date.now() - start;
    }

    return this.profileRepo.save(profile);
  }
}
