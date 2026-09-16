import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectionsService } from '../../connections/connections.service';
import { StagedData } from '../../../database/entities';
import type { MatchSourceRef } from '../../../database/entities';
import type { DatabaseDriver } from '../../connections/drivers/database-driver.interface';
import { assertColumnAllowed } from '../matching-governance';

export interface SourcePage {
  rows: Record<string, unknown>[];
  lastKey: string | null;
}

/**
 * Dialect-aware identifier quoting, mirroring the private `quoteId` helper
 * in `data-quality/profiling.service.ts` (duplicated rather than imported —
 * that helper is not exported from its module).
 */
function quoteId(dbType: string, name: string): string {
  if (dbType === 'mysql') return `\`${name.replace(/`/g, '')}\``;
  if (dbType === 'sqlserver') return `[${name.replace(/[[\]]/g, '')}]`;
  return `"${name.replace(/"/g, '')}"`;
}

/**
 * Dialect-aware bound-parameter placeholder for the one parameter this
 * reader ever binds (`afterKey`). Postgres/Redshift use numbered `$1`
 * placeholders; MySQL/SQLite use positional `?`; SQL Server's driver binds
 * by name (`request.input('p0', ...)`) and expects `@p0` in the SQL text
 * itself. The Snowflake/BigQuery/ClickHouse driver implementations do not
 * currently thread `params` through to their underlying client at all
 * (see their `query()` signatures) — a pre-existing gap in those three
 * drivers, out of scope for this reader to fix.
 */
function paramPlaceholder(dbType: string): string {
  if (dbType === 'mysql' || dbType === 'sqlite') return '?';
  if (dbType === 'sqlserver') return '@p0';
  return '$1';
}

/**
 * Uniform paged reader both entity-matching source paths go through: a
 * table behind a saved `Connection`, or an already-imported `StagedData`
 * dataset. Pages with keyset pagination (`WHERE pk > afterKey ORDER BY pk
 * LIMIT n`), never `OFFSET` — `DatabaseDriver.query()` returns its whole
 * result in one in-memory array with no cursor, so `OFFSET` would degrade
 * quadratically over a large table and can skip or duplicate rows under
 * concurrent writes.
 *
 * Every column this reader touches — including the primary key — is
 * checked against the project's column allow-list via
 * `assertColumnAllowed`, with no exception for the key. That one rule with
 * no special cases is what makes the allow-list auditable: everything the
 * reader reads is allow-listed. A later setup wizard is responsible for
 * adding the chosen primary key to the allow-list it derives.
 */
@Injectable()
export class SourceReaderService {
  constructor(
    private readonly connectionsService: ConnectionsService,
    @InjectRepository(StagedData)
    private readonly stagedDataRepository: Repository<StagedData>,
  ) {}

  async countRows(
    source: MatchSourceRef,
    allowlist: string[],
    organizationId: string,
  ): Promise<number> {
    assertColumnAllowed(source.primaryKey, allowlist);

    if (source.kind === 'staged') {
      const staged = await this.loadStaged(source, organizationId);
      return Array.isArray(staged.data) ? staged.data.length : 0;
    }

    const { driver, quote } = await this.connect(source, organizationId);
    try {
      const from = `${quote(source.schemaName as string)}.${quote(source.tableName as string)}`;
      const result = await driver.query(`SELECT COUNT(*) AS "_count" FROM ${from}`);
      const row = (result.rows[0] ?? {}) as Record<string, unknown>;
      return Number(row['_count'] ?? row['count'] ?? 0);
    } finally {
      await this.disconnect(driver);
    }
  }

  /**
   * Returns at most `limit` rows ordered by the source's primary key.
   * `lastKey` is the primary key of the final row, or `null` for an empty
   * page. Each row carries only the primary key and the allow-listed
   * columns.
   *
   * The connection path is genuinely incremental — each call fetches only
   * `limit` rows via keyset pagination. The staged path is not: a
   * `StagedData` row's `data` is a single JSONB array with no query
   * surface of its own, so that branch materialises the entire dataset in
   * memory and filters/sorts/slices it there. That asymmetry is forced by
   * the storage format, not a shortcut — staged datasets are bounded by
   * whatever already fits in a JSONB column, so no further paging
   * strategy is needed for them.
   */
  async readPage(
    source: MatchSourceRef,
    allowlist: string[],
    organizationId: string,
    afterKey: string | null,
    limit: number,
  ): Promise<SourcePage> {
    assertColumnAllowed(source.primaryKey, allowlist);
    const columns = this.projectionColumns(source.primaryKey, allowlist);

    if (source.kind === 'staged') {
      return this.readStagedPage(source, columns, organizationId, afterKey, limit);
    }
    return this.readConnectionPage(source, columns, organizationId, afterKey, limit);
  }

  /**
   * Builds the projection as [primaryKey, ...allowlist minus primaryKey],
   * so the emitted SQL says `SELECT "id", "surname"` rather than
   * `SELECT "id", "id", "surname"` when (as normal) the allow-list already
   * contains the key. Every non-key column is re-validated against the
   * allow-list too, even though it is already sourced from it, because
   * this is the single choke point the SELECT list is built from.
   */
  private projectionColumns(primaryKey: string, allowlist: string[]): string[] {
    const rest = allowlist.filter((c) => c !== primaryKey);
    for (const col of rest) assertColumnAllowed(col, allowlist);
    return [primaryKey, ...rest];
  }

  private async connect(
    source: MatchSourceRef,
    organizationId: string,
  ): Promise<{ dbType: string; driver: DatabaseDriver; quote: (name: string) => string }> {
    const connectionId = source.connectionId as string;
    const { connection } = await this.connectionsService.getConnectionConfig(connectionId, organizationId);
    const dbType = connection.type;
    const driver = await this.connectionsService.getDriver(connectionId, organizationId);
    return { dbType, driver, quote: (name: string) => quoteId(dbType, name) };
  }

  private async disconnect(driver: DatabaseDriver): Promise<void> {
    if (typeof driver.disconnect === 'function') {
      await driver.disconnect().catch(() => {});
    }
  }

  private async readConnectionPage(
    source: MatchSourceRef,
    columns: string[],
    organizationId: string,
    afterKey: string | null,
    limit: number,
  ): Promise<SourcePage> {
    const { dbType, driver, quote } = await this.connect(source, organizationId);
    try {
      const from = `${quote(source.schemaName as string)}.${quote(source.tableName as string)}`;
      const pkCol = quote(source.primaryKey);
      const selectCols = columns.map((c) => quote(c)).join(', ');

      let sql = `SELECT ${selectCols} FROM ${from}`;
      const params: unknown[] = [];
      if (afterKey !== null) {
        sql += ` WHERE ${pkCol} > ${paramPlaceholder(dbType)}`;
        params.push(afterKey);
      }
      sql += ` ORDER BY ${pkCol} LIMIT ${limit}`;

      const result = await driver.query(sql, params);
      const rows = result.rows as Record<string, unknown>[];
      const lastKey = rows.length > 0 ? String(rows[rows.length - 1][source.primaryKey]) : null;
      return { rows, lastKey };
    } finally {
      await this.disconnect(driver);
    }
  }

  /** Loads a `StagedData` row scoped to `organizationId` — a row belonging to another organization must never be returned. */
  private async loadStaged(source: MatchSourceRef, organizationId: string): Promise<StagedData> {
    const staged = await this.stagedDataRepository.findOne({
      where: { id: source.stagedDataId as string, organizationId },
    });
    if (!staged) {
      throw new NotFoundException(`Staged dataset ${source.stagedDataId} not found`);
    }
    return staged;
  }

  private async readStagedPage(
    source: MatchSourceRef,
    columns: string[],
    organizationId: string,
    afterKey: string | null,
    limit: number,
  ): Promise<SourcePage> {
    const staged = await this.loadStaged(source, organizationId);
    const pk = source.primaryKey;
    const allRows = Array.isArray(staged.data) ? (staged.data as Record<string, unknown>[]) : [];

    const filtered = allRows
      .filter((row) => afterKey === null || String(row[pk]) > afterKey)
      .sort((a, b) => {
        const [ka, kb] = [String(a[pk]), String(b[pk])];
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      })
      .slice(0, limit);

    const rows = filtered.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const col of columns) projected[col] = row[col];
      return projected;
    });

    const lastKey = rows.length > 0 ? String(rows[rows.length - 1][pk]) : null;
    return { rows, lastKey };
  }
}
