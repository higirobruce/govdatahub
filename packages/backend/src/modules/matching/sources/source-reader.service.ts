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
 * itself. Only the Postgres branch is exercised against a real query the
 * unit tests assert on end to end; the MySQL/SQLite/SQL Server branches
 * are pinned by unit assertions on the returned string only, not verified
 * against a live engine of that dialect. `assertPageableDialect` below
 * keeps this function from ever being reached for a dialect whose driver
 * cannot bind parameters at all.
 */
function paramPlaceholder(dbType: string): string {
  if (dbType === 'mysql' || dbType === 'sqlite') return '?';
  if (dbType === 'sqlserver') return '@p0';
  return '$1';
}

/**
 * Connection types whose `DatabaseDriver.query()` cannot page this reader —
 * four, not three. An earlier pass (this task's original review round)
 * checked `snowflake`/`bigquery`/`clickhouse` plus `postgres`/`mysql` as
 * controls and never enumerated the remaining five signatures, missing
 * `mongodb`. See `assertPageableDialect` below for why each is refused.
 */
const UNSUPPORTED_KEYSET_TYPES = new Set(['snowflake', 'bigquery', 'clickhouse', 'mongodb']);

/**
 * Refuses a connection type that cannot page this reader, before any SQL
 * is built.
 *
 * Three are refused because their driver cannot bind query parameters:
 * `snowflake.driver.ts` and `bigquery.driver.ts` declare `query(sql:
 * string)` with no `params` argument at all — TypeScript's structural
 * typing still lets that satisfy `DatabaseDriver.query(sql, params?)`, so
 * nothing catches this at compile time — and `clickhouse.driver.ts`
 * accepts `params` but discards it (`_params?: any[]`). Keyset pagination
 * depends on `afterKey` being bound, not interpolated (see
 * `paramPlaceholder` above); on these three the bound value would
 * silently vanish, leaving the literal placeholder token in the SQL text,
 * and the query would either fail with a confusing engine error or,
 * worse, return the same page forever.
 *
 * The fourth, `mongodb`, is refused for a different and more fundamental
 * reason: `mongodb.driver.ts`'s `query()` does not speak SQL at all — it
 * `JSON.parse(sql)`s its argument and expects `{"collection":...,
 * "filter":...}`. This reader would hand it `SELECT "id" FROM ...` and it
 * would die inside `JSON.parse` with a raw JSON-syntax error, which is
 * exactly the confusing, undiagnosable failure this guard exists to
 * prevent. `data-quality/profiling.service.ts` already refuses MongoDB
 * explicitly for the same underlying reason — this is an established
 * pattern in this codebase, not a special case invented here. A Mongo
 * collection is genuinely reachable as a source: that driver implements
 * `getSchemas`/`getTables`/`getColumns` like any SQL driver would.
 *
 * The three bind-incapable drivers are a pre-existing gap in those driver
 * implementations, not a limitation of entity matching — fixing it means
 * threading each client's own binding API (BigQuery named parameters,
 * Snowflake `binds`) and testing against three hosted services, which is
 * its own piece of work. Refusing here, fail-closed, is the correct
 * choice until that work happens. Do not delete this guard to make a
 * downstream failure go away — the driver, not this reader, is what's
 * missing.
 */
function assertPageableDialect(dbType: string): void {
  if (dbType === 'mongodb') {
    throw new BadRequestException(
      `Connection type "mongodb" is not a SQL engine — the entity-matching reader emits SQL and cannot page a MongoDB source.`,
    );
  }
  if (UNSUPPORTED_KEYSET_TYPES.has(dbType)) {
    throw new BadRequestException(
      `Connection type "${dbType}" does not support bound query parameters, which keyset pagination requires — the entity-matching reader cannot page this source.`,
    );
  }
}

/**
 * Ceiling on `limit`. NOT the `MAX_RESULT_ROWS` convention used elsewhere
 * in this codebase (`queries.service.ts`, `transformations-executor.service.ts`,
 * `dataset-sharing.service.ts`, all default 10,000) — that constant bounds
 * what an ad-hoc user query hands back to a browser, where 10,000 rows is
 * already more than anyone reads. This reader is a different kind of
 * consumer: an internal batch loader whose pages stream into a workspace
 * table and get discarded, never shown to a user. Bounding it by a
 * user-facing result cap imports a constraint that doesn't apply here — a
 * mistake made in an earlier round of this task, caught in review.
 *
 * MUST stay at or above `MATCHING_BATCH_ROWS` (default 50,000 — design
 * spec §13 config table), because Task 6's materializer pages `readPage`
 * at that batch size. Lowering this below 50,000 breaks the materializer
 * on its very first page. 100,000 gives two-fold headroom over that
 * documented default while still bounding memory meaningfully:
 * `driver.query()` materialises a page in one in-memory array, and
 * 100,000 rows of a handful of narrow normalized text columns is tens of
 * megabytes, not gigabytes — the spec's own sizing (10M rows at 50,000 a
 * page is 200 round trips) is what this reader was designed around.
 */
const MAX_PAGE_LIMIT = 100_000;

/**
 * `limit` is interpolated directly into `LIMIT ${limit}` (there is no SQL
 * bind position for a `LIMIT` clause's row count in any of the six
 * pageable dialects here), so unlike `afterKey` it can never be a bound
 * parameter — it must be validated before it ever reaches the SQL string.
 * `limit` is a public-API parameter, not an internal constant: nothing
 * about TypeScript's `number` type survives a serialization boundary
 * (a queued job payload, or a later controller reading `req.query.limit`),
 * so this is checked at runtime rather than trusted from the type
 * signature. Rejects rather than silently clamps, in the same fail-closed
 * style as `assertColumnAllowed` and `assertPageableDialect` elsewhere in
 * this file — a caller passing a bad limit has a bug worth surfacing, not
 * a value worth quietly overriding.
 */
function assertValidLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new BadRequestException(
      `Invalid page limit ${JSON.stringify(limit)} — must be a positive integer.`,
    );
  }
  if (limit > MAX_PAGE_LIMIT) {
    throw new BadRequestException(
      `Page limit ${limit} exceeds the maximum of ${MAX_PAGE_LIMIT}.`,
    );
  }
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
    assertValidLimit(limit);
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
    assertPageableDialect(dbType);
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
