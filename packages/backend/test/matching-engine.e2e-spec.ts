/**
 * Entity-matching engine, end to end against a real PostgreSQL server.
 *
 * Every other test of this feature mocks `dataSource.query`, so until this
 * file ran, not one line of the SQL the engine generates had ever been
 * executed. That is the whole point of this suite: it is the first thing
 * that makes PostgreSQL, rather than a reviewer, the authority on whether
 * the generated SQL is well typed and means what it was meant to mean.
 *
 * It runs against the database the application itself is configured for
 * (the repo-root `.env`, exactly as `src/database/data-source.ts` loads it)
 * and it requires that database to have been migrated -- `pg_trgm`,
 * `fuzzystrmatch`, the `matching` schema and the `match_*` tables all come
 * from `1711000000010-AddEntityMatching`.
 *
 *   pnpm test:e2e -- --runTestsByPath test/matching-engine.e2e-spec.ts
 *
 * Everything it creates is namespaced to one throwaway organization and one
 * throwaway `matching_fixture` schema, both removed in `afterAll` unless
 * `KEEP_MATCHING_E2E_DATA=1` is set (which is what to set when a run fails
 * and the rows are the evidence).
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  AiProvider,
  MatchProject,
  MatchRun,
  Organization,
} from '../src/database/entities';
import { OrganizationSettings } from '../src/database/entities/organization-settings.entity';
import { MatchingModule } from '../src/modules/matching/matching.module';
import { MatchRunService } from '../src/modules/matching/match-run.service';
import { BlockingService } from '../src/modules/matching/blocking.service';
import { EvalService } from '../src/modules/matching/eval.service';
import { MatchingCleanupService } from '../src/modules/matching/matching-cleanup.service';
import { MaterializeService } from '../src/modules/matching/materialize.service';
import { EncryptionService } from '../src/modules/encryption/encryption.service';

// The same three candidate locations `src/database/data-source.ts` tries, so
// this suite and the TypeORM CLI always agree on which server they mean.
for (const path of [
  resolve(__dirname, '../../../.env'),
  resolve(__dirname, '../.env'),
  resolve(process.cwd(), '.env'),
]) {
  loadEnv({ path, override: false });
}

const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'admin',
  password: process.env.DB_PASSWORD || 'admin123',
  database: process.env.DB_DATABASE || 'govdatahub',
};

/** A whole run of this fixture is seconds, not minutes; this is slack, not a target. */
const RUN_TIMEOUT_MS = 300_000;

const MATCH_AT = 0.72;
const REJECT_AT = 0.5;

/**
 * Chosen from the fixture's own score separation, not tuned against the
 * assertions: the 300 true duplicates score 0.75..0.99 and the 100 hard
 * negatives score 0.50..0.68, so any `matchAt` in (0.68, 0.75) separates
 * them perfectly. 0.72 is inside that gap with room on both sides, and the
 * threshold sweep this suite prints shows the plateau either side of it.
 */
const THRESHOLDS = { matchAt: MATCH_AT, rejectAt: REJECT_AT };

interface StageTiming {
  status: string;
  ms: number;
}

describe('matching engine (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let runService: MatchRunService;
  let blocking: BlockingService;
  let evalService: EvalService;
  let cleanupService: MatchingCleanupService;
  let materialize: MaterializeService;
  let runRepo: Repository<MatchRun>;
  let projectRepo: Repository<MatchProject>;

  const orgId = uuidv4();
  const connectionId = uuidv4();
  const projectId = uuidv4();
  let project: MatchProject;
  let firstRunId: string;
  let firstRunTimings: StageTiming[] = [];

  // ---------------------------------------------------------------- helpers

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  /**
   * The brief's helper: `MatchRunService.start` returns as soon as the run
   * row exists and runs the pipeline detached, so a caller that went through
   * `start` has to wait for a terminal status rather than await the call.
   */
  async function waitForStatus(runId: string, want: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const run = await runRepo.findOne({ where: { id: runId } });
      if (run?.status === want) return;
      if (run?.status === 'failed') throw new Error(`run failed: ${run.errorMessage}`);
      await sleep(250);
    }
    throw new Error(`run ${runId} did not reach ${want} within ${timeoutMs}ms`);
  }

  /** A `pending` run row, exactly as `MatchRunService.start` creates one. */
  async function newRun(): Promise<string> {
    const run = await runRepo.save({
      id: uuidv4(),
      organizationId: orgId,
      projectId,
      status: 'pending' as const,
      counters: {
        leftRows: 0, rightRows: 0, candidatePairs: 0, autoMatch: 0, grey: 0,
        autoReject: 0, clusters: 0, flaggedClusters: 0, estimatedPairs: 0,
        hasInexactPass: false,
      },
      watermarks: {},
      droppedKeys: [],
      finishedAt: null,
      durationMs: null,
      errorMessage: null,
    });
    return run.id;
  }

  /**
   * Awaits `execute` directly rather than polling after `start`, so a failure
   * arrives as the driver's own exception -- with `.query` and `.parameters`
   * on it -- instead of as a one-line `error_message` on the run row. Finding
   * the verbatim failing SQL is most of the value this suite has.
   *
   * The status poller alongside it is how the stage timings are measured:
   * `runStages` writes each stage's status before entering it, so the
   * transitions observed here are the real stage boundaries.
   */
  async function executeWithTimings(runId: string): Promise<StageTiming[]> {
    const marks: Array<{ status: string; at: number }> = [{ status: 'pending', at: Date.now() }];
    let finished = false;

    const pipeline = runService.execute(runId, orgId).finally(() => {
      finished = true;
    });

    const poller = (async () => {
      while (!finished) {
        const row = await runRepo.findOne({ where: { id: runId } });
        if (row && row.status !== marks[marks.length - 1].status) {
          marks.push({ status: row.status, at: Date.now() });
        }
        await sleep(50);
      }
    })();

    try {
      await pipeline;
    } catch (error) {
      const failure = error as Error & { query?: string; parameters?: unknown[] };
      // eslint-disable-next-line no-console
      console.error(
        `\n--- match run ${runId} failed ---\n${failure.message}\n` +
          (failure.query ? `--- failing SQL ---\n${failure.query}\n` : '') +
          (failure.parameters ? `--- parameters ---\n${JSON.stringify(failure.parameters)}\n` : ''),
      );
      await poller.catch(() => undefined);
      throw error;
    }
    await poller;

    const end = Date.now();
    return marks.map((mark, i) => ({
      status: mark.status,
      ms: (i + 1 < marks.length ? marks[i + 1].at : end) - mark.at,
    }));
  }

  async function countCandidates(runId: string): Promise<number> {
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM match_candidates WHERE run_id = $1`,
      [runId],
    );
    return count;
  }

  // ------------------------------------------------------------------ setup

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          ...DB,
          entities: [join(__dirname, '../src/database/entities/*.entity.{ts,js}')],
          synchronize: false,
          logging: false,
        }),
        MatchingModule,
      ],
    }).compile();
    // Not just `compile()`: `EncryptionService` reads ENCRYPTION_KEY in
    // `onModuleInit`, and a compiled-but-uninitialised module never runs
    // lifecycle hooks, so the key would be undefined.
    await moduleRef.init();

    dataSource = moduleRef.get(DataSource);
    runService = moduleRef.get(MatchRunService);
    blocking = moduleRef.get(BlockingService);
    evalService = moduleRef.get(EvalService);
    cleanupService = moduleRef.get(MatchingCleanupService);
    materialize = moduleRef.get(MaterializeService);
    runRepo = moduleRef.get(getRepositoryToken(MatchRun));
    projectRepo = moduleRef.get(getRepositoryToken(MatchProject));
    const encryption = moduleRef.get(EncryptionService);

    // The fixture: 10,000 citizens with 300 planted duplicates, plus the
    // labelled pair set. Deterministic, so the numbers below are reproducible.
    await dataSource.query(readFileSync(join(__dirname, 'fixtures/matching-duplicates.sql'), 'utf8'));

    await dataSource.getRepository(Organization).save({
      id: orgId,
      name: 'Matching E2E Organization',
      subdomain: `matching-e2e-${orgId.slice(0, 8)}`,
      settings: null as unknown as string,
      isActive: true,
    });

    // `assertLocalProvider` refuses the run outright unless the organization's
    // AI provider is local -- phase 1 must never send personal data anywhere.
    await dataSource.getRepository(OrganizationSettings).save({
      organizationId: orgId,
      aiProvider: AiProvider.LOCAL,
    });

    // The source the matcher reads through: a normal saved Connection that
    // happens to point back at this same server's fixture schema, so the run
    // goes through `SourceReaderService` and the real postgres driver rather
    // than a shortcut.
    await dataSource.query(
      `INSERT INTO connections (id, name, type, config, organization_id) VALUES ($1, $2, $3, $4, $5)`,
      [
        connectionId,
        'Matching E2E Fixture',
        'postgresql',
        encryption.encryptObject({
          host: DB.host,
          port: DB.port,
          username: DB.username,
          password: DB.password,
          database: DB.database,
          ssl: false,
        }),
        orgId,
      ],
    );

    project = await projectRepo.save({
      id: projectId,
      organizationId: orgId,
      name: 'Citizen register dedupe (e2e)',
      description: null,
      mode: 'dedupe',
      leftSource: {
        kind: 'connection',
        connectionId,
        schemaName: 'matching_fixture',
        tableName: 'citizens',
        primaryKey: 'id',
      },
      rightSource: null,
      fieldMap: [
        { left: 'full_name', right: 'full_name', role: 'person_name', weight: 0.4, comparator: 'trgm' },
        { left: 'surname', right: 'surname', role: 'person_name', weight: 0.15, comparator: 'trgm' },
        { left: 'birth_date', right: 'birth_date', role: 'date', weight: 0.35, comparator: 'daydiff' },
        { left: 'phone', right: 'phone', role: 'phone', weight: 0.1, comparator: 'exact' },
        // Weight 0, deliberately: this mapping exists so the `address` role's
        // three comparators -- including `lev`, which raises
        // `argument exceeds the maximum length of 255 characters` above 255
        // bytes and is why `comparatorExprs` truncates with `left(x, 255)` --
        // are materialised into `features` and really evaluated against the
        // fixture's 354-byte addresses, without disturbing a score model whose
        // separation was calibrated on the other four fields. `features` is
        // built from every comparator of every mapped field regardless of
        // weight, so a zero weight suppresses the contribution, not the
        // evaluation.
        { left: 'address', right: 'address', role: 'address', weight: 0, comparator: 'trgm' },
      ],
      // All four passes together cover all three blocking-key functions
      // `blocking-sql.ts` compiles -- `year`, `dmetaphone` and `last9` -- each
      // of which lands in a `GENERATED ALWAYS AS (...) STORED` column, where a
      // function PostgreSQL does not consider IMMUTABLE is refused outright at
      // CREATE TABLE time. Nothing but a live server can check that.
      blockingPasses: [
        // Exact: catches the transposed-birth-date cohort, and is the pass
        // whose `|1985` key the degenerate-key guard must drop.
        { name: 'surname_year', kind: 'equi', keyExpr: 'surname|year(birth_date)' },
        // Inexact: the only pass that can reach the swapped-name and
        // surname-typo cohorts, and the one that needs the GIN trigram index
        // and the transaction-scoped `pg_trgm.similarity_threshold`.
        { name: 'name_trgm', kind: 'trigram', keyExpr: 'full_name', threshold: 0.5 },
        // Phonetic: `dmetaphone` in a stored generated column.
        { name: 'dmeta_year', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(birth_date)' },
        // Single-term: `last9`, whose degenerate value is the bare empty
        // string rather than a composite -- 60 rows here have no phone.
        { name: 'phone_last9', kind: 'equi', keyExpr: 'last9(phone)' },
      ],
      thresholds: THRESHOLDS,
      // `district` is deliberately left out: the reader must never copy a
      // column nobody mapped, and the allow-list is the legal boundary.
      columnAllowlist: ['id', 'given_name', 'surname', 'full_name', 'birth_date', 'phone', 'address'],
      lawfulBasis: 'e2e test fixture',
      dataOwner: 'matching e2e suite',
      retentionDays: 30,
      status: 'active',
    });

    // The gold set EvalService measures against: the fixture's own truth
    // table, positives and hard negatives alike.
    await dataSource.query(
      `INSERT INTO match_gold_pairs (id, organization_id, project_id, left_key, right_key, is_match, labelled_by)
       SELECT gen_random_uuid()::text, $1, $2, left_key, right_key, is_match, 'fixture'
       FROM matching_fixture.truth`,
      [orgId, projectId],
    );

    firstRunId = await newRun();
    firstRunTimings = await executeWithTimings(firstRunId);
    // eslint-disable-next-line no-console
    console.log(
      `\nmeasured stage timings at 10,000 rows:\n` +
        firstRunTimings.map((t) => `  ${t.status.padEnd(14)} ${t.ms} ms`).join('\n'),
    );
  }, RUN_TIMEOUT_MS);

  afterAll(async () => {
    if (!moduleRef) return;
    if (process.env.KEEP_MATCHING_E2E_DATA !== '1') {
      const runIds: Array<{ id: string }> = await dataSource.query(
        `SELECT id FROM match_runs WHERE organization_id = $1`,
        [orgId],
      );
      const ids = runIds.map((r) => r.id);
      if (ids.length > 0) {
        await dataSource.query(`DELETE FROM match_candidates WHERE run_id = ANY($1::text[])`, [ids]);
      }
      for (const table of ['match_entities', 'match_crosswalk', 'match_gold_pairs', 'match_runs', 'match_projects']) {
        await dataSource.query(`DELETE FROM ${table} WHERE organization_id = $1`, [orgId]);
      }
      await dataSource.query(`DELETE FROM match_decisions WHERE organization_id = $1`, [orgId]);
      await dataSource.query(`DELETE FROM connections WHERE organization_id = $1`, [orgId]);
      await dataSource.query(`DELETE FROM organization_settings WHERE organization_id = $1`, [orgId]);
      await dataSource.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
      await dataSource.query(`DROP TABLE IF EXISTS ${materialize.workspaceTable(projectId, 'left')}`);
      await dataSource.query(`DROP SCHEMA IF EXISTS matching_fixture CASCADE`);
    }
    await moduleRef.close();
  }, 120_000);

  // ------------------------------------------------------------------ tests

  it('runs end to end against real PostgreSQL and reaches completed', async () => {
    const finished = await runRepo.findOne({ where: { id: firstRunId } });
    // eslint-disable-next-line no-console
    console.log(`\nrun counters: ${JSON.stringify(finished!.counters)}`);
    expect(finished!.status).toBe('completed');
    expect(finished!.errorMessage).toBeNull();
    expect(finished!.counters.leftRows).toBe(10_000);
    expect(finished!.counters.rightRows).toBe(0);
    // Ruling R20: a trigram pass makes `estimatedPairs` a lower bound, and
    // the flag that says so must be set from the estimate, never defaulted.
    expect(finished!.counters.hasInexactPass).toBe(true);
  });

  it('excludes the empty-surname key as degenerate and records it on the run', async () => {
    const finished = await runRepo.findOne({ where: { id: firstRunId } });
    const dropped = finished!.droppedKeys;
    expect(dropped.some((d) => d.pass === 'surname_year')).toBe(true);
    // 60 rows share the composite key `|1985` -- an empty surname and one
    // birth year. It is the only key in the fixture over the R19 cutoff.
    expect(dropped.flatMap((d) => d.keys)).toContain('|1985');
    expect(JSON.stringify(dropped)).toContain('|');
    // The `last9(phone)` pass's degenerate value is the bare empty string --
    // 60 rows have no phone -- so the guard must also drop a key that is not
    // composite and is falsy in JavaScript.
    const phonePass = dropped.find((d) => d.pass === 'phone_last9');
    expect(phonePass).toBeDefined();
    expect(phonePass!.keys).toContain('');
    // eslint-disable-next-line no-console
    console.log(`\ndropped keys: ${JSON.stringify(dropped)}`);
  });

  it('stores far fewer candidates than it saw, because rejects are never stored', async () => {
    const count = await countCandidates(firstRunId);
    const finished = await runRepo.findOne({ where: { id: firstRunId } });
    expect(count).toBeLessThan(finished!.counters.candidatePairs);
    // Holds only because this run has no human decisions: a decided pair is
    // stored but counted by neither `autoMatch` nor `grey`. See the third
    // run below, where it deliberately stops holding.
    expect(count).toBe(finished!.counters.autoMatch + finished!.counters.grey);
    expect(finished!.counters.autoReject).toBe(finished!.counters.candidatePairs - count);
  });

  it('never stores a pair below rejectAt when nobody has ruled on it', async () => {
    // The fixture's 20 "low-score blocked" pairs share a surname and a birth
    // year, so the exact pass really proposes them, but they score ~0.38.
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM match_candidates
        WHERE run_id = $1 AND (left_key, right_key) IN (
          SELECT 'P' || lpad((4200 + 2 * k)::text, 6, '0'), 'P' || lpad((4201 + 2 * k)::text, 6, '0')
          FROM generate_series(0, 19) AS k)`,
      [firstRunId],
    );
    expect(count).toBe(0);

    const [{ below }] = await dataSource.query(
      `SELECT count(*)::int AS below FROM match_candidates WHERE run_id = $1 AND score < $2`,
      [firstRunId, REJECT_AT],
    );
    expect(below).toBe(0);
  });

  it('scores a pair whose normalized birth date is the empty string, and a 354-byte address', async () => {
    // Two hazards in one cohort, neither of which any other row reaches.
    //
    // `NormalizationService.normalizeDate` returns '' for a NULL and for an
    // unparseable string alike, so '' is what the workspace holds for every
    // missing date. `''::date` is not NULL in PostgreSQL, it is
    // `invalid input syntax for type date: ""`, and it aborts the whole
    // scoring statement rather than one pair -- so if the presence guard were
    // missing, this run would not have completed at all.
    //
    // The same rows carry a 354-byte address, and this server really does
    // refuse `levenshtein argument exceeds maximum length of 255 characters`
    // -- verified directly -- so `left(x, 255)` in the `lev` comparator is
    // load-bearing, not decorative. `features` materialises every comparator
    // of every mapped role, so it is evaluated even at weight 0.
    const rows = await dataSource.query(
      `SELECT left_key, score, features FROM match_candidates
        WHERE run_id = $1 AND (left_key, right_key) IN (
          SELECT 'P' || lpad((4240 + 2 * k)::text, 6, '0'), 'P' || lpad((4241 + 2 * k)::text, 6, '0')
          FROM generate_series(0, 19) AS k)
        ORDER BY left_key`,
      [firstRunId],
    );
    expect(rows).toHaveLength(20);
    for (const row of rows) {
      // A missing date on either side scores 0 -- not NULL, which would make
      // the whole weighted sum NULL and drop the pair out of both sides of
      // the grey band without any error.
      expect(row.features.birth_date_daydiff).toBe(0);
      expect(Number(row.score)).toBeGreaterThan(0);
      expect(typeof row.features.address_lev).toBe('number');
      expect(row.features.address_lev).toBeGreaterThan(0);
    }
    // eslint-disable-next-line no-console
    console.log(`\nmissing-date pair features: ${JSON.stringify(rows[0].features)}`);
  });

  it('recovers at least 80 percent of the known duplicate pairs', async () => {
    const metrics = await evalService.evaluate(project, firstRunId, MATCH_AT);
    // eslint-disable-next-line no-console
    console.log(
      `\ngold-set metrics at matchAt=${MATCH_AT}: ` +
        `TP=${metrics.truePositives} FP=${metrics.falsePositives} FN=${metrics.falseNegatives} ` +
        `precision=${metrics.precision.toFixed(4)} recall=${metrics.recall.toFixed(4)} f1=${metrics.f1.toFixed(4)}`,
    );
    expect(metrics.recall).toBeGreaterThan(0.8);
    expect(metrics.precision).toBeGreaterThan(0.9);
  });

  it('measures the same recall and precision directly against the fixture truth table', async () => {
    // EvalService can only judge pairs that carry a label. This measure is
    // stricter: every predicted pair the truth table does not contain is a
    // false positive, which is meaningful here only because the fixture's
    // 300 planted duplicates are the complete set of real duplicates in it.
    const [row] = await dataSource.query(
      `WITH predicted AS (
         SELECT left_key AS a, right_key AS b FROM match_candidates
          WHERE run_id = $1 AND score >= $2),
       positives AS (
         SELECT least(left_key, right_key) AS a, greatest(left_key, right_key) AS b
           FROM matching_fixture.truth WHERE is_match)
       SELECT (SELECT count(*) FROM predicted)::int AS predicted,
              (SELECT count(*) FROM predicted p JOIN positives t ON t.a = p.a AND t.b = p.b)::int AS tp,
              (SELECT count(*) FROM positives)::int AS gold`,
      [firstRunId, MATCH_AT],
    );
    const recall = row.tp / row.gold;
    const precision = row.predicted === 0 ? 0 : row.tp / row.predicted;
    // eslint-disable-next-line no-console
    console.log(
      `\ntruth-table metrics at matchAt=${MATCH_AT}: predicted=${row.predicted} tp=${row.tp} ` +
        `gold=${row.gold} precision=${precision.toFixed(4)} recall=${recall.toFixed(4)}`,
    );
    expect(recall).toBeGreaterThan(0.8);
    expect(precision).toBeGreaterThan(0.9);
  });

  it('shows a threshold plateau around the chosen matchAt rather than a knife edge', async () => {
    const sweep = await evalService.sweep(project, firstRunId);
    const window = sweep.filter((p) => p.matchAt >= 0.68 && p.matchAt <= 0.75);
    // eslint-disable-next-line no-console
    console.log(
      `\nthreshold sweep: ` +
        window.map((p) => `${p.matchAt}:f1=${p.metrics.f1.toFixed(3)}`).join('  '),
    );
    expect(window.every((p) => p.metrics.f1 > 0.8)).toBe(true);
  });

  it('publishes a crosswalk row for every clustered, unflagged member', async () => {
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM match_crosswalk WHERE project_id = $1`,
      [projectId],
    );
    expect(count).toBeGreaterThan(0);

    // Stronger than a row count: both members of every planted duplicate pair
    // must have landed on the same entity key, which is the only thing a
    // downstream cross-agency join can actually use.
    const [{ agreed }] = await dataSource.query(
      `SELECT count(*)::int AS agreed FROM matching_fixture.truth t
         JOIN match_crosswalk l ON l.project_id = $1 AND l.source_key = t.left_key
         JOIN match_crosswalk r ON r.project_id = $1 AND r.source_key = t.right_key
        WHERE t.is_match AND l.entity_key = r.entity_key`,
      [projectId],
    );
    // eslint-disable-next-line no-console
    console.log(`\ncrosswalk: ${count} rows, ${agreed}/300 planted pairs share an entity key`);
    expect(agreed).toBeGreaterThan(240); // > 80% of the 300 planted pairs

    // And no hard negative may share one.
    const [{ merged }] = await dataSource.query(
      `SELECT count(*)::int AS merged FROM matching_fixture.truth t
         JOIN match_crosswalk l ON l.project_id = $1 AND l.source_key = t.left_key
         JOIN match_crosswalk r ON r.project_id = $1 AND r.source_key = t.right_key
        WHERE NOT t.is_match AND l.entity_key = r.entity_key`,
      [projectId],
    );
    expect(merged).toBe(0);
  });

  it('plans the trigram pass as a GIN index scan, not a self cross-product', async () => {
    // The design note on `candidatePairsSql` says `similarity()` alone cannot
    // use the GIN trigram index and that the planner then falls back to a
    // cross product that is "correct but never returns at real scale". Nothing
    // short of a live planner can check that claim, so check it here: the `%`
    // operator must actually reach the index the materializer built.
    const pass = project.blockingPasses.find((p) => p.kind === 'trigram')!;
    const sql = blocking.candidatePairsSql(project, pass, []);
    const plan: Array<Record<string, string>> = await dataSource.transaction(async (manager) => {
      for (const setting of blocking.passSessionSettings(pass)) await manager.query(setting);
      return manager.query(`EXPLAIN ${sql}`);
    });
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');
    // eslint-disable-next-line no-console
    console.log(`\ntrigram pass plan:\n${text}`);
    expect(text).toContain('bk_name_trgm_trgm_idx');
    expect(text).not.toContain('Nested Loop  (cost=0.00');
  });

  it('refuses a second concurrent run of the same project', async () => {
    // `pg_try_advisory_lock` on a dedicated connection, never the blocking
    // form: two runs of one project share a workspace table that each of them
    // drops and rebuilds, so the loser must fail immediately.
    const [a, b] = await Promise.allSettled([
      runService.execute(await newRun(), orgId),
      runService.execute(await newRun(), orgId),
    ]);
    const outcomes = [a, b];
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('already running');
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);

    // The lock must be gone afterwards, or this project could never run again
    // for the life of the connection.
    const locks = await dataSource.query(
      `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND classid = 19777`,
    );
    expect(locks[0].count).toBe(0);
  }, RUN_TIMEOUT_MS);

  it('keeps the entity key stable across a second run', async () => {
    const before = await dataSource.query(
      `SELECT source_key, entity_key FROM match_crosswalk WHERE project_id = $1 ORDER BY source_key`,
      [projectId],
    );
    expect(before.length).toBeGreaterThan(0);

    // Through `start` this time, so the background entry point and the
    // brief's polling helper are both really exercised.
    const second = await runService.start(projectId, orgId);
    await waitForStatus(second.id, 'completed', RUN_TIMEOUT_MS);

    const after = await dataSource.query(
      `SELECT source_key, entity_key FROM match_crosswalk WHERE project_id = $1 ORDER BY source_key`,
      [projectId],
    );
    expect(after).toEqual(before);
  }, RUN_TIMEOUT_MS);

  it('carries a human verdict onto the candidate, latest verdict winning', async () => {
    // Two verdicts on one pair, recorded in the other key order, under two
    // different source refs (which the pair's unique constraint permits).
    // The decisions CTE must fold them to one row and take the *latest*, via
    // `(array_agg(decision ORDER BY created_at DESC, id DESC))[1]`.
    const pairLow = ['P004200', 'P004201'];
    await dataSource.query(
      `INSERT INTO match_decisions
         (id, organization_id, project_id, left_source_ref, left_key, right_source_ref, right_key, decision, created_at)
       VALUES
         ($1, $3, $4, 'review:first', $6, 'review:first', $5, 'no_match', now() - interval '2 hours'),
         ($2, $3, $4, 'review:second', $6, 'review:second', $5, 'match',    now() - interval '1 hour')`,
      [uuidv4(), uuidv4(), orgId, projectId, pairLow[0], pairLow[1]],
    );
    // A pair the score would have auto-matched, vetoed by a person.
    await dataSource.query(
      `INSERT INTO match_decisions
         (id, organization_id, project_id, left_source_ref, left_key, right_source_ref, right_key, decision)
       VALUES ($1, $2, $3, 'review:first', 'P001010', 'review:first', 'D000001', 'no_match')`,
      [uuidv4(), orgId, projectId],
    );

    const runId = await newRun();
    await runService.execute(runId, orgId);

    // Ruling R23: `score >= rejectAt OR human_decision IS NOT NULL` must admit
    // this pair despite a score well under rejectAt, and must never evaluate
    // to UNKNOWN for the pairs it excludes.
    const [confirmed] = await dataSource.query(
      `SELECT decision, score FROM match_candidates WHERE run_id = $1 AND left_key = $2 AND right_key = $3`,
      [runId, pairLow[0], pairLow[1]],
    );
    expect(confirmed).toBeDefined();
    expect(confirmed.decision).toBe('confirmed');
    expect(Number(confirmed.score)).toBeLessThan(REJECT_AT);

    const [rejected] = await dataSource.query(
      `SELECT decision, score FROM match_candidates WHERE run_id = $1 AND left_key = 'D000001' AND right_key = 'P001010'`,
      [runId],
    );
    expect(rejected).toBeDefined();
    expect(rejected.decision).toBe('rejected');
    expect(Number(rejected.score)).toBeGreaterThanOrEqual(MATCH_AT);

    // And the counter caveat the entity documents is real: with decisions in
    // play, stored candidates are strictly more than autoMatch + grey.
    const stored = await countCandidates(runId);
    const run = await runRepo.findOne({ where: { id: runId } });
    expect(stored).toBeGreaterThan(run!.counters.autoMatch + run!.counters.grey);

    // A vetoed pair must not be clustered, so its two records must not share
    // an entity key.
    const [{ merged }] = await dataSource.query(
      `SELECT count(*)::int AS merged FROM match_entities
        WHERE run_id = $1 AND members @> '[{"sourceKey":"P001010"}]' AND members @> '[{"sourceKey":"D000001"}]'`,
      [runId],
    );
    expect(merged).toBe(0);
  }, RUN_TIMEOUT_MS);

  it('records a refused blocking estimate as a failed run and gives the lock back', async () => {
    // The only path in this pipeline that fails on purpose, and the only one
    // that writes the terminal failure state -- `finish(..., 'failed', error)`
    // -- against a real row. A run left non-terminal, or a project lock left
    // held by a dead run, is invisible until the next run of that project
    // refuses to start.
    const previous = process.env.MATCHING_MAX_CANDIDATE_PAIRS;
    process.env.MATCHING_MAX_CANDIDATE_PAIRS = '1';
    const runId = await newRun();
    try {
      await expect(runService.execute(runId, orgId)).rejects.toThrow(/refuses this run/);
    } finally {
      if (previous === undefined) delete process.env.MATCHING_MAX_CANDIDATE_PAIRS;
      else process.env.MATCHING_MAX_CANDIDATE_PAIRS = previous;
    }

    const failed = await runRepo.findOne({ where: { id: runId } });
    expect(failed!.status).toBe('failed');
    expect(failed!.errorMessage).toContain('Blocking estimate refuses this run');
    expect(failed!.finishedAt).not.toBeNull();
    expect(failed!.durationMs).toBeGreaterThanOrEqual(0);
    // The counters written before the refusal are still there -- a failed run
    // whose numbers were rolled back would tell an operator nothing about why.
    expect(failed!.counters.leftRows).toBe(10_000);

    const locks = await dataSource.query(
      `SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND classid = 19777`,
    );
    expect(locks[0].count).toBe(0);

    // And a terminal run must refuse to be executed a second time rather than
    // silently re-running and overwriting its own outcome.
    await expect(runService.execute(runId, orgId)).rejects.toThrow(/has already finished/);
    await expect(runService.execute(firstRunId, orgId)).rejects.toThrow(/has already finished/);
  }, RUN_TIMEOUT_MS);

  it('sweeps expired workspaces and deletes their candidates in chunks', async () => {
    // Runs last: it drops the workspace table and deletes every candidate row
    // belonging to an expired project.
    const before = await dataSource.query(
      `SELECT count(*)::int AS count FROM match_candidates WHERE organization_id = $1`,
      [orgId],
    );
    expect(before[0].count).toBeGreaterThan(0);

    // Retention is read once in the constructor, so it is overridden on the
    // instance rather than through the environment.
    (cleanupService as unknown as { retentionDays: number }).retentionDays = -1;
    const result = await cleanupService.cleanupExpiredWorkspaces();
    expect(result.projectsSwept).toBeGreaterThanOrEqual(1);

    const after = await dataSource.query(
      `SELECT count(*)::int AS count FROM match_candidates WHERE organization_id = $1`,
      [orgId],
    );
    expect(after[0].count).toBe(0);

    const table = materialize.workspaceTable(projectId, 'left');
    const [, segment] = table.split('.');
    const exists = await dataSource.query(
      `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'matching' AND table_name = $1`,
      [segment],
    );
    expect(exists[0].count).toBe(0);
  }, 120_000);
});
