import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { BlockingPass, FieldMapping, MatchProject, MatchSourceRef } from '../../database/entities';
import { NormalizationService } from './normalization.service';
import { blockingKeyExpr, assertIdent } from './blocking-sql';
import { assertColumnAllowed } from './matching-governance';
import { SourceReaderService } from './sources/source-reader.service';

/** Default page/insert-batch size (design spec §13); see `sources/source-reader.service.ts`'s `MAX_PAGE_LIMIT` doc comment for why this must never be raised above 100,000. */
const DEFAULT_MATCHING_BATCH_ROWS = 50_000;

/**
 * PostgreSQL's `NAMEDATALEN - 1`: the maximum length in bytes of any
 * identifier. PostgreSQL does not reject a longer one — it *truncates* it
 * to this length and emits a notice, so an over-long index name fails
 * silently until two names truncate to the same 63 bytes and the second
 * `CREATE INDEX` dies with `relation already exists`. `assertIdent`
 * validates the character class only and never the length, so this is
 * checked separately.
 */
const MAX_IDENTIFIER_BYTES = 63;

/** Characters of the underscored project id used as an index-name prefix — see `blockingSpecs`. */
const INDEX_PREFIX_CHARS = 8;

export interface MaterializeResult {
  rows: number;
  lastKey: string | null;
}

/** One blocking pass resolved into the exact identifiers and SQL this run will emit. */
interface BlockingSpec {
  passName: string;
  columnName: string;
  keyExpr: string;
  indexName: string;
  kind: BlockingPass['kind'];
}

/**
 * Copies a project's allow-listed columns from a source (a saved
 * `Connection` table or a `StagedData` dataset) into a per-project,
 * per-side workspace table in DataGate's own PostgreSQL, then adds one
 * generated blocking-key column and index per blocking pass.
 *
 * This is the component that decides what data physically enters
 * DataGate: every column name it writes into generated DDL or DML is
 * drawn from `project.fieldMap[].left` (or the source's primary key) and
 * is checked against `project.columnAllowlist` via `assertColumnAllowed`
 * first, with no exception for the primary key. That allow-list check is
 * this feature's legal boundary, not merely a correctness concern.
 */
@Injectable()
export class MaterializeService {
  private readonly logger = new Logger(MaterializeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly sourceReader: SourceReaderService,
    private readonly normalization: NormalizationService,
  ) {}

  /**
   * `matching.p_<projectId with dashes replaced by underscores>_<side>`.
   * UUID project ids contain dashes, which are invalid inside an
   * unquoted identifier, hence the replacement. The resulting segment
   * (everything after `matching.`) is the last line of defence for an
   * identifier that has no bind-parameter form, so it is run through
   * `assertIdent` before being interpolated into any SQL.
   */
  workspaceTable(projectId: string, side: 'left' | 'right'): string {
    const segment = assertIdent(`p_${projectId.replace(/-/g, '_')}_${side}`, 'workspace table name');
    return `matching.${segment}`;
  }

  /**
   * Drops and recreates the workspace table, reloads every row from the
   * source in pages of `MATCHING_BATCH_ROWS`, and creates the project's
   * blocking-key indexes. Returns the row count and the last page's key
   * as a watermark for the orchestrator (Task 13) to record on the run --
   * phase 1 never uses a stored watermark to skip work; see
   * `recreateTable` below for why.
   *
   * Every name and expression this run will emit is resolved and
   * validated *before* the first statement is issued, so a bad field map
   * or an over-long index name fails with the workspace table still
   * intact rather than half-way through a reload.
   */
  async materialize(project: MatchProject, side: 'left' | 'right', runId: string): Promise<MaterializeResult> {
    const source = side === 'left' ? project.leftSource : project.rightSource;
    if (!source) {
      throw new BadRequestException(`Match project ${project.id} has no ${side} source configured`);
    }

    const table = this.workspaceTable(project.id, side);
    this.logger.log(`Materializing ${side} workspace ${table} for project ${project.id} (run ${runId})`);

    // Every column named below comes from project.fieldMap[].left (or the
    // source's own primary key), and every one of them passes
    // assertColumnAllowed against project.columnAllowlist first -- the
    // primary key included, with no exception.
    const primaryKey = assertColumnAllowed(source.primaryKey, project.columnAllowlist);
    const fieldColumns = project.fieldMap.map((f) => assertColumnAllowed(f.left, project.columnAllowlist));
    this.assertNoDuplicateColumns(fieldColumns, project.id);
    const readColumns = Array.from(new Set([primaryKey, ...fieldColumns]));
    const blocking = this.blockingSpecs(project, side);

    await this.recreateTable(table, fieldColumns, blocking);
    const result = await this.loadRows(table, source, project, readColumns, primaryKey, fieldColumns);
    await this.createBlockingIndexes(table, blocking);

    return result;
  }

  /**
   * Rejects a source column that two `fieldMap` entries both map, rather
   * than silently keeping one of them.
   *
   * `CREATE TABLE (... "surname" text, "surname" text)` is refused
   * outright by PostgreSQL, so the duplicate has to be dealt with one way
   * or the other. Throwing is the right way: two mappings on one column
   * with different roles is a configuration mistake the operator needs
   * told about, and de-duplicating would silently keep whichever role
   * happened to come last, making the score depend on field-map ordering.
   * `fieldMap` is JSONB, so the compile-time shape is no runtime
   * guarantee -- the same reasoning `blocking-sql.ts` already applies to
   * weights.
   */
  private assertNoDuplicateColumns(fieldColumns: string[], projectId: string): void {
    const seen = new Set<string>();
    for (const column of fieldColumns) {
      if (seen.has(column)) {
        throw new BadRequestException(
          `Column "${column}" is mapped more than once in the field map for match project ${projectId} — ` +
            `each source column may be mapped at most once`,
        );
      }
      seen.add(column);
    }
  }

  /**
   * Resolves every blocking pass into the exact column name, generated
   * expression and index name this run will emit, validating all of them
   * before any statement is issued.
   *
   * Index names are composed from a short prefix of the project id rather
   * than the full UUID-derived table segment (`p_` + 36 characters +
   * `_left` = 43 bytes on its own), because PostgreSQL's identifier limit
   * is 63 bytes and it *truncates* rather than erroring: the brief's own
   * `near_name` trigram pass produced a 65-byte name under the old
   * scheme, which worked only until a second pass sharing its first 63
   * bytes collided with it. The prefix keeps names unique in practice
   * within the `matching` schema; `assertIndexNameLength` is the backstop
   * for when it does not, and it runs here -- before the table is dropped
   * -- so an over-long name can never fail mid-reload.
   */
  private blockingSpecs(project: MatchProject, side: 'left' | 'right'): BlockingSpec[] {
    const prefix = assertIdent(
      project.id.replace(/-/g, '_').slice(0, INDEX_PREFIX_CHARS),
      'index name project prefix',
    );

    return project.blockingPasses.map((pass) => {
      const passName = assertIdent(pass.name, 'blocking pass name');
      const columnName = assertIdent(`bk_${passName}`, 'blocking pass column name');
      const suffix = pass.kind === 'trigram' ? 'trgm_idx' : 'idx';
      const indexName = assertIdent(`${prefix}_${side}_${columnName}_${suffix}`, 'index name');
      this.assertIndexNameLength(indexName, passName);

      return { passName, columnName, keyExpr: blockingKeyExpr(pass, project.fieldMap), indexName, kind: pass.kind };
    });
  }

  private assertIndexNameLength(indexName: string, passName: string): void {
    const bytes = Buffer.byteLength(indexName, 'utf8');
    if (bytes > MAX_IDENTIFIER_BYTES) {
      throw new BadRequestException(
        `Index name "${indexName}" for blocking pass "${passName}" is ${bytes} bytes, over PostgreSQL's ` +
          `${MAX_IDENTIFIER_BYTES}-byte identifier limit — shorten the pass name`,
      );
    }
  }

  /**
   * Unconditionally drops and recreates the workspace table on every
   * run, rather than reusing it and only appending new rows.
   *
   * This closes a real hazard by construction: a column normalized under
   * role `text` in one run and re-scored under role `date` in a later
   * run (an operator editing `fieldMap` between runs) would otherwise
   * leave stale text-shaped values sitting in a column that the new
   * run's blocking/scoring SQL now treats as a date -- and a single
   * non-blank, unparseable string reaching a `::date` cast aborts the
   * *entire* run, not just one row (see `blocking-sql.ts`'s `guarded()`
   * doc comment for the same failure mode). Rebuilding the workspace
   * from the *current* `fieldMap` on every run guarantees the workspace
   * and this run's generated SQL can never disagree about a column's
   * role. Incremental re-materialization (skipping unchanged rows via a
   * stored watermark) is phase 3/4 work -- reopening this hazard is that
   * work's problem to close, not something to "optimise" away here.
   *
   * The blocking-key columns are declared here, in the `CREATE TABLE`,
   * and not bolted on with `ALTER TABLE ... ADD COLUMN` after the load:
   * adding a `STORED` generated column to a populated table forces a full
   * heap rewrite under `ACCESS EXCLUSIVE`, so three passes over the
   * spec's 10M-row example would be three sequential rewrites of a table
   * that was just written. PostgreSQL computes a `STORED` column
   * server-side during the `INSERT`s at no extra cost, so declaring the
   * columns up front is strictly cheaper. Indexes are the opposite case
   * and stay after the load -- see `createBlockingIndexes`.
   */
  private async recreateTable(table: string, fieldColumns: string[], blocking: BlockingSpec[]): Promise<void> {
    await this.dataSource.query(`DROP TABLE IF EXISTS ${table}`);

    const columnDefs = fieldColumns.map((c) => `"${c}" text`);
    const generatedDefs = blocking.map(
      (b) => `"${b.columnName}" text GENERATED ALWAYS AS (${b.keyExpr}) STORED`,
    );
    const allColumns = [`"src_key" text PRIMARY KEY`, ...columnDefs, ...generatedDefs].join(', ');
    await this.dataSource.query(`CREATE TABLE ${table} (${allColumns})`);
  }

  /**
   * Loops `readPage` until it returns an empty page, writing each page's
   * rows with parameterized multi-row `INSERT`s -- one per page unless
   * the page is wide enough to need chunking under PostgreSQL's
   * bound-parameter cap (see `insertPage`). `COPY` would be faster and is
   * named in the design spec as a later optimisation; a parameterized
   * multi-row insert is correct and testable now.
   *
   * `project.columnAllowlist` is what the reader is handed as its
   * allow-list and `readColumns` as its projection: the reader re-checks
   * every projected column against the allow-list, and because the two
   * lists have different provenance that check can actually fail. The
   * projection is narrower than the allow-list on purpose -- an
   * allow-listed column nobody mapped is a column there is no reason to
   * copy into DataGate.
   */
  private async loadRows(
    table: string,
    source: MatchSourceRef,
    project: MatchProject,
    readColumns: string[],
    primaryKey: string,
    fieldColumns: string[],
  ): Promise<MaterializeResult> {
    const limit = this.batchSize();
    let afterKey: string | null = null;
    let lastKey: string | null = null;
    let totalRows = 0;

    for (;;) {
      const page = await this.sourceReader.readPage(
        source,
        project.columnAllowlist,
        readColumns,
        project.organizationId,
        afterKey,
        limit,
      );
      if (page.rows.length === 0) break;

      await this.insertPage(table, primaryKey, fieldColumns, project.fieldMap, page.rows);

      totalRows += page.rows.length;
      lastKey = page.lastKey;
      afterKey = page.lastKey;
    }

    return { rows: totalRows, lastKey };
  }

  private async insertPage(
    table: string,
    primaryKey: string,
    fieldColumns: string[],
    fieldMap: FieldMapping[],
    rows: Record<string, unknown>[],
  ): Promise<void> {
    const roleByColumn = new Map(fieldMap.map((f) => [f.left, f.role]));
    const quotedColumns = ['"src_key"', ...fieldColumns.map((c) => `"${c}"`)].join(', ');
    const rowWidth = 1 + fieldColumns.length;

    // PostgreSQL's wire protocol allows at most 65535 bound parameters in a
    // single statement. MATCHING_BATCH_ROWS (default 50,000) times even a
    // handful of mapped fields blows well past that limit, so one page's
    // rows are chunked into sub-batches that stay comfortably under it.
    // Each sub-batch is still a parameterized multi-row INSERT -- this is
    // more than one statement per page only when the page is wide enough
    // to need it, never a switch to COPY.
    const maxRowsPerStatement = Math.max(1, Math.floor(60_000 / rowWidth));

    for (let offset = 0; offset < rows.length; offset += maxRowsPerStatement) {
      const chunk = rows.slice(offset, offset + maxRowsPerStatement);
      const params: unknown[] = [];
      const valueTuples: string[] = [];
      let paramIndex = 1;

      for (const row of chunk) {
        const rowValues: unknown[] = [
          String(row[primaryKey]),
          ...fieldColumns.map((col) => this.normalization.normalizeByRole(roleByColumn.get(col)!, row[col])),
        ];
        params.push(...rowValues);
        valueTuples.push(`(${rowValues.map(() => `$${paramIndex++}`).join(', ')})`);
      }

      await this.dataSource.query(
        `INSERT INTO ${table} (${quotedColumns}) VALUES ${valueTuples.join(', ')}`,
        params,
      );
    }
  }

  /**
   * Creates one index per blocking pass, *after* the load: a btree for an
   * `equi` pass, a GIN trigram index for a `trigram` one. Unlike the
   * generated columns (declared in `recreateTable`), deferring an index
   * until the rows are in is genuinely cheaper -- building it once over
   * the finished table beats maintaining it across every `INSERT`.
   */
  private async createBlockingIndexes(table: string, blocking: BlockingSpec[]): Promise<void> {
    for (const spec of blocking) {
      if (spec.kind === 'trigram') {
        await this.dataSource.query(
          `CREATE INDEX "${spec.indexName}" ON ${table} USING gin ("${spec.columnName}" gin_trgm_ops)`,
        );
      } else {
        await this.dataSource.query(`CREATE INDEX "${spec.indexName}" ON ${table} ("${spec.columnName}")`);
      }
    }
  }

  /**
   * Reads `MATCHING_BATCH_ROWS` fresh on every call rather than caching
   * it at construction, so a test (or an operator) can change the
   * environment variable between calls. Falls back to the design spec's
   * documented default of 50,000 -- see
   * `sources/source-reader.service.ts`'s `MAX_PAGE_LIMIT` doc comment:
   * this value must never exceed 100,000, which `readPage` enforces by
   * throwing.
   */
  private batchSize(): number {
    const parsed = parseInt(process.env.MATCHING_BATCH_ROWS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MATCHING_BATCH_ROWS;
  }
}
