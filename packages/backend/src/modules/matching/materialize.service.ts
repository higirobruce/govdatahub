import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { FieldMapping, MatchProject, MatchSourceRef } from '../../database/entities';
import { NormalizationService } from './normalization.service';
import { blockingKeyExpr, assertIdent } from './blocking-sql';
import { assertColumnAllowed } from './matching-governance';
import { SourceReaderService } from './sources/source-reader.service';

/** Default page/insert-batch size (design spec §13); see `sources/source-reader.service.ts`'s `MAX_PAGE_LIMIT` doc comment for why this must never be raised above 100,000. */
const DEFAULT_MATCHING_BATCH_ROWS = 50_000;

export interface MaterializeResult {
  rows: number;
  lastKey: string | null;
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
   * source in pages of `MATCHING_BATCH_ROWS`, and adds the project's
   * blocking-key columns and indexes. Returns the row count and the last
   * page's key as a watermark for the orchestrator (Task 13) to record
   * on the run -- phase 1 never uses a stored watermark to skip work; see
   * `recreateTable` below for why.
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
    const readColumns = Array.from(new Set([primaryKey, ...fieldColumns]));

    await this.recreateTable(table, fieldColumns);
    const result = await this.loadRows(table, source, project, readColumns, primaryKey, fieldColumns);
    await this.addBlockingColumns(table, project);

    return result;
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
   */
  private async recreateTable(table: string, fieldColumns: string[]): Promise<void> {
    await this.dataSource.query(`DROP TABLE IF EXISTS ${table}`);

    const columnDefs = fieldColumns.map((c) => `"${c}" text`);
    const allColumns = [`"src_key" text PRIMARY KEY`, ...columnDefs].join(', ');
    await this.dataSource.query(`CREATE TABLE ${table} (${allColumns})`);
  }

  /**
   * Loops `readPage` until it returns an empty page, writing each page's
   * rows as one multi-row parameterized `INSERT`. `COPY` would be
   * faster and is named in the design spec as a later optimisation; a
   * parameterized multi-row insert is correct and testable now.
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
      const page = await this.sourceReader.readPage(source, readColumns, project.organizationId, afterKey, limit);
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
   * Adds one generated blocking-key column and one index per blocking
   * pass, after the load loop -- generating the column from `keyExpr`
   * during the bulk insert would recompute it on the client for every
   * row for no benefit, since PostgreSQL computes a `GENERATED ALWAYS
   * AS ... STORED` column itself once the column exists.
   */
  private async addBlockingColumns(table: string, project: MatchProject): Promise<void> {
    const tableSegment = assertIdent(table.split('.')[1], 'workspace table name');

    for (const pass of project.blockingPasses) {
      const passName = assertIdent(pass.name, 'blocking pass name');
      const columnName = assertIdent(`bk_${passName}`, 'blocking pass column name');
      const keyExpr = blockingKeyExpr(pass, project.fieldMap);

      await this.dataSource.query(
        `ALTER TABLE ${table} ADD COLUMN "${columnName}" text GENERATED ALWAYS AS (${keyExpr}) STORED`,
      );

      if (pass.kind === 'trigram') {
        const indexName = assertIdent(`${tableSegment}_${columnName}_trgm_idx`, 'index name');
        await this.dataSource.query(
          `CREATE INDEX "${indexName}" ON ${table} USING gin ("${columnName}" gin_trgm_ops)`,
        );
      } else {
        const indexName = assertIdent(`${tableSegment}_${columnName}_idx`, 'index name');
        await this.dataSource.query(`CREATE INDEX "${indexName}" ON ${table} ("${columnName}")`);
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
