import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ScoringService } from './scoring.service';
import { BlockingService } from './blocking.service';
import { MaterializeService } from './materialize.service';
import type { BlockingPass, MatchProject, MatchRun } from '../../database/entities';

/**
 * The scoring stage runs its statements against the *transaction*'s
 * manager, not the DataSource directly (Ruling R21: `SET LOCAL` is a no-op
 * outside a transaction). The mock below therefore hands the transaction
 * callback a manager whose `query` is the very same jest mock as
 * `dataSource.query`, so the assertions can keep reading
 * `dataSource.query.mock.calls` while the implementation is still obliged
 * to open a real transaction -- `dataSource.query` itself throws if it is
 * called while no transaction is open, so an implementation that dropped
 * `dataSource.transaction` would fail every test in this file rather than
 * quietly losing the session settings.
 */
describe('ScoringService', () => {
  let service: ScoringService;
  let txDepth = 0;
  /** Whether a transaction was open at the moment each statement was issued. */
  let insideTransaction: boolean[] = [];

  const query = jest.fn(async (sql: string, params?: unknown[]): Promise<unknown[]> => {
    void params;
    insideTransaction.push(txDepth > 0);
    if (txDepth === 0) {
      throw new Error(`Statement issued outside a transaction: ${String(sql)}`);
    }
    return defaultResultFor(String(sql));
  });

  /** Routes on statement shape so a test need not hard-code call ordering. */
  function defaultResultFor(sql: string): unknown[] {
    if (sql.startsWith('SET LOCAL')) return [];
    if (sql.includes('INSERT INTO "match_candidates"')) {
      return [{ inserted: '3', auto_match: '1', grey: '2' }];
    }
    return [{ total: '10' }];
  }

  const dataSource = {
    query,
    transaction: jest.fn(async (cb: (manager: { query: typeof query }) => Promise<unknown>) => {
      txDepth += 1;
      try {
        return await cb({ query });
      } finally {
        txDepth -= 1;
      }
    }),
  };

  const materialize = {
    workspaceTable: jest.fn(
      (projectId: string, side: 'left' | 'right') => `matching.p_${projectId.replace(/-/g, '_')}_${side}`,
    ),
  };

  const equiPass: BlockingPass = { name: 'name_dob', kind: 'equi', keyExpr: 'dmetaphone(surname)|year(dob)' };
  const trigramPass: BlockingPass = { name: 'near_name', kind: 'trigram', keyExpr: 'surname', threshold: 0.4 };

  const project: MatchProject = {
    id: 'p1',
    organizationId: 'org1',
    name: 'Citizens dedupe',
    description: null,
    mode: 'dedupe',
    leftSource: {
      kind: 'connection',
      connectionId: 'c1',
      schemaName: 'public',
      tableName: 'citizens',
      primaryKey: 'id',
    },
    rightSource: null,
    fieldMap: [
      { left: 'surname', right: 'surname', role: 'person_name', weight: 0.5, comparator: 'trgm' },
      { left: 'dob', right: 'dob', role: 'date', weight: 0.3, comparator: 'daydiff' },
    ],
    blockingPasses: [equiPass],
    thresholds: { matchAt: 0.9, rejectAt: 0.55 },
    columnAllowlist: ['id', 'surname', 'dob'],
    lawfulBasis: 'consent',
    dataOwner: 'owner@example.com',
    retentionDays: 30,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as MatchProject;

  const run: MatchRun = {
    id: 'run1',
    organizationId: 'org1',
    projectId: 'p1',
    status: 'scoring',
    counters: {},
    watermarks: {},
    droppedKeys: [],
    startedAt: new Date(),
    finishedAt: null,
    durationMs: null,
    errorMessage: null,
  } as unknown as MatchRun;

  /** The one statement that writes to `match_candidates`. */
  const insertCall = (): [string, unknown[]] => {
    const call = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO "match_candidates"'));
    if (!call) throw new Error(`No insert statement was issued. Calls: ${query.mock.calls.length}`);
    return [String(call[0]), (call[1] ?? []) as unknown[]];
  };
  const insertSql = (): string => insertCall()[0];

  /**
   * Ruling R25: `match_decisions.decision` holds a person's *verdict*
   * (`'match'` / `'no_match'`); `match_candidates.decision` holds a pair's
   * *state in a run* (`'auto_match'` / `'grey'` / `'confirmed'` /
   * `'rejected'`). The generated SQL translates one into the other. These
   * three readers model that whole path -- verdict in, stored state out --
   * so the R23 and R25 tests assert what the statement *does* to a pair
   * rather than what it looks like.
   *
   * They are narrow readers of the exact grammar this service emits, not
   * SQL parsers, and they throw on anything they do not recognise so a
   * rewritten statement fails loudly instead of passing vacuously.
   */

  /** The verdict values the `decisions` CTE admits at all. */
  const verdictsAdmitted = (sql: string): string[] => {
    const filter = sql.match(/AND "decision" IN \(([^)]+)\)/);
    if (!filter) throw new Error(`No verdict filter on match_decisions in:\n${sql}`);
    return [...filter[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };

  /** The CTE's verdict -> candidate-state mapping, as data. `{}` if absent. */
  const verdictMapping = (sql: string): Record<string, string> => {
    const block = sql.match(
      /CASE \(array_agg\("decision" ORDER BY "created_at" DESC, "id" DESC\)\)\[1\]([\s\S]*?)END AS decision/,
    );
    if (!block) return {};
    return Object.fromEntries(
      [...block[1].matchAll(/WHEN '([a-z_]+)' THEN '([a-z_]+)'/g)].map((m) => [m[1], m[2]]),
    );
  };

  /**
   * What the statement does to one candidate pair: is it stored, and under
   * which `match_candidates.decision`?
   */
  const simulate = (
    sql: string,
    params: unknown[],
    pair: { score: number; verdict: string | null },
  ): { stored: boolean; decision: string | null } => {
    // 1. the decisions CTE: admit the verdict, then translate it.
    let humanDecision: string | null = null;
    if (pair.verdict !== null && verdictsAdmitted(sql).includes(pair.verdict)) {
      const mapped = verdictMapping(sql)[pair.verdict];
      if (!mapped) {
        throw new Error(`Verdict "${pair.verdict}" is admitted but never mapped to a candidate state`);
      }
      humanDecision = mapped;
    }

    // 2. the insert's row filter.
    const predicate = sql.match(/\n  WHERE ([^\n]+)\n  ON CONFLICT/);
    if (!predicate) throw new Error(`No recognisable row filter in:\n${sql}`);
    const stored = predicate[1].split(/\s+OR\s+/).some((term) => {
      const threshold = term.match(/^score >= \$(\d+)::double precision$/);
      if (threshold) return pair.score >= Number(params[Number(threshold[1]) - 1]);
      if (term === 'human_decision IS NOT NULL') return humanDecision !== null;
      throw new Error(`Unrecognised term in the row filter: "${term}"`);
    });
    if (!stored) return { stored: false, decision: null };

    // 3. the decision CASE.
    const arms = sql.match(
      /CASE WHEN human_decision IS NOT NULL THEN human_decision\s+WHEN score >= \$(\d+)::double precision THEN 'auto_match'\s+ELSE 'grey' END/,
    );
    if (!arms) throw new Error(`No recognisable decision CASE in:\n${sql}`);
    if (humanDecision !== null) return { stored: true, decision: humanDecision };
    return {
      stored: true,
      decision: pair.score >= Number(params[Number(arms[1]) - 1]) ? 'auto_match' : 'grey',
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    txDepth = 0;
    insideTransaction = [];
    // clearAllMocks does not drain a mockResolvedValueOnce queue; reset does.
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      insideTransaction.push(txDepth > 0);
      if (txDepth === 0) {
        throw new Error(`Statement issued outside a transaction: ${String(sql)}`);
      }
      return defaultResultFor(String(sql));
    });

    const mod = await Test.createTestingModule({
      providers: [
        ScoringService,
        BlockingService,
        { provide: DataSource, useValue: dataSource },
        { provide: MaterializeService, useValue: materialize },
      ],
    }).compile();
    service = mod.get(ScoringService);
  });

  it('inserts only pairs at or above the reject threshold', async () => {
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(sql).toMatch(/INSERT INTO "match_candidates"/);
    expect(sql).toContain('WHERE score >= ');
    // An auto-rejected pair is counted and discarded, never stored: there
    // is no such decision value anywhere in the generated SQL.
    expect(sql).not.toMatch(/'auto_reject'/);
    // ...and the threshold itself is a bound value, so the filter cannot be
    // satisfied by an unrelated literal that happens to read `>=`.
    const rejectAtPlaceholder = sql.match(/WHERE score >= \$(\d+)/);
    expect(rejectAtPlaceholder).not.toBeNull();
    expect(params[Number(rejectAtPlaceholder![1]) - 1]).toBe(0.55);
  });

  it('labels each inserted pair auto_match or grey from the thresholds', async () => {
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(sql).toContain(`'auto_match'`);
    expect(sql).toContain(`'grey'`);
    const matchAtPlaceholder = sql.match(/WHEN score >= \$(\d+)::double precision THEN 'auto_match'/);
    expect(matchAtPlaceholder).not.toBeNull();
    expect(params[Number(matchAtPlaceholder![1]) - 1]).toBe(0.9);
    // `grey` must be the fall-through, not a second threshold test: a pair
    // between rejectAt and matchAt has to land in the review queue.
    expect(sql).toContain(`ELSE 'grey' END`);
  });

  it('counts rejected pairs without storing them', async () => {
    query
      .mockResolvedValueOnce([{ total: '1000' }]) // candidate pairs seen
      .mockResolvedValueOnce([{ inserted: '40', auto_match: '10', grey: '30' }]);
    const result = await service.scorePass(project, run, equiPass, []);
    expect(result.autoReject).toBe(960);
    expect(result.inserted).toBe(40);
    expect(result.autoMatch).toBe(10);
    expect(result.grey).toBe(30);
    // Ruling P9: exactly two statements for an equi pass, count first, and
    // 960 is derived arithmetic -- it appears in no mocked result, so an
    // implementation that queried the rejected rows would need a third
    // statement (and would get `undefined` from this two-deep mock).
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain('count(*) AS total');
    expect(String(query.mock.calls[0][0])).not.toContain('INSERT');
    expect(String(query.mock.calls[1][0])).toContain('INSERT INTO "match_candidates"');
  });

  it('stores a pair a person ruled a match, whose computed score falls below rejectAt (R23/R25)', async () => {
    // A steward only ever adjudicates the pairs the score was unsure about
    // -- a pair scoring 0.95 never reaches the review queue -- so decided
    // pairs skew low-scoring by construction. Filtering on score alone
    // discards the human verdict exactly where it carries the most
    // information, and the next run re-asks a question someone already
    // answered. rejectAt is 0.55 here.
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(simulate(sql, params, { score: 0.4, verdict: 'match' })).toEqual({
      stored: true,
      decision: 'confirmed',
    });
  });

  it('stores a pair a person ruled no_match, whose computed score falls below rejectAt (R23/R25)', async () => {
    // A recorded non-match is just as permanent as a recorded match;
    // re-proposing it every run is the same defect wearing the opposite sign.
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(simulate(sql, params, { score: 0.2, verdict: 'no_match' })).toEqual({
      stored: true,
      decision: 'rejected',
    });
  });

  it('maps a verdict to a candidate state and cannot silently swap the two (Ruling R25)', async () => {
    // `match_decisions.decision` is what a person said;
    // `match_candidates.decision` is a pair's state in a run. They are
    // different vocabularies, and the join reads the first one. Filtering
    // for candidate states here -- as this service did before R25 -- matches
    // nothing a reviewer can ever produce, so every human decision becomes
    // invisible and the queue re-asks every question forever, with no error
    // anywhere.
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(verdictsAdmitted(sql).sort()).toEqual(['match', 'no_match']);
    expect(verdictMapping(sql)).toEqual({ match: 'confirmed', no_match: 'rejected' });
    // Swapping the two arms must fail, so pin each direction end to end.
    expect(simulate(sql, params, { score: 0.99, verdict: 'match' }).decision).toBe('confirmed');
    expect(simulate(sql, params, { score: 0.99, verdict: 'no_match' }).decision).toBe('rejected');
    // A candidate state is not a verdict: a stray 'confirmed' or
    // 'auto_match' in the verdict column must not be honoured as one. Such
    // a pair falls through to the thresholds instead of being taken as a
    // human ruling -- the safe failure (it is re-reviewed) rather than the
    // unsafe one (a fabricated verdict merges two citizens).
    expect(simulate(sql, params, { score: 0.4, verdict: 'confirmed' })).toEqual({
      stored: false,
      decision: null,
    });
    expect(simulate(sql, params, { score: 0.99, verdict: 'auto_match' }).decision).toBe('auto_match');
  });

  it('still discards an undecided pair below rejectAt, and keeps one at the boundary', async () => {
    // Ruling R23 widens the filter for human-decided pairs only. The
    // hundreds of millions of auto-rejects it exists to not store are
    // unaffected, and `>=` stays inclusive at the threshold itself.
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(simulate(sql, params, { score: 0.54, verdict: null }).stored).toBe(false);
    expect(simulate(sql, params, { score: 0.55, verdict: null })).toEqual({ stored: true, decision: 'grey' });
    expect(simulate(sql, params, { score: 0.9, verdict: null })).toEqual({
      stored: true,
      decision: 'auto_match',
    });
  });

  it('derives autoReject from what was stored, not from the label counts', async () => {
    // Five pairs proposed, four stored -- one of which carried a human
    // verdict and so counts as neither auto_match nor grey. autoReject is
    // 5 - 4 = 1; an implementation deriving it from the labels would say
    // 5 - (2 + 1) = 2 and report a rejection that never happened.
    query
      .mockResolvedValueOnce([{ total: '5' }])
      .mockResolvedValueOnce([{ inserted: '4', auto_match: '2', grey: '1' }]);
    const result = await service.scorePass(project, run, equiPass, []);
    expect(result.autoReject).toBe(1);
  });

  it('honours an existing Decision instead of re-scoring the pair, in either key order', async () => {
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(sql).toContain('match_decisions');
    // The join reads verdicts (Ruling R25) and stores candidate states.
    expect(sql).toContain(`'match'`);
    expect(sql).toContain(`'no_match'`);
    expect(sql).toContain(`'confirmed'`);
    expect(sql).toContain(`'rejected'`);
    // The human verdict wins over the thresholds, and is not merely one
    // more CASE arm after them.
    expect(sql).toContain(`CASE WHEN human_decision IS NOT NULL THEN human_decision`);
    // A person may have recorded the pair as (b, a) while the blocking
    // self-join proposes (a, b). Both sides of the join are order-normalized
    // so the decision is still found; a one-directional
    // `d.left_key = p.left_key AND d.right_key = p.right_key` join would
    // silently re-ask a question a person already answered.
    expect(sql).toContain(`least("left_key", "right_key") AS k1`);
    expect(sql).toContain(`greatest("left_key", "right_key") AS k2`);
    expect(sql).toContain(`d.k1 = least(p.left_key, p.right_key)`);
    expect(sql).toContain(`d.k2 = greatest(p.left_key, p.right_key)`);
    // Organization isolation: decisions are read for this org and project only.
    const orgPlaceholder = sql.match(/"organization_id" = \$(\d+)::text/);
    const projectPlaceholder = sql.match(/"project_id" = \$(\d+)::text/);
    expect(params[Number(orgPlaceholder![1]) - 1]).toBe('org1');
    expect(params[Number(projectPlaceholder![1]) - 1]).toBe('p1');
  });

  it('collapses duplicate decisions so a decided pair cannot be inserted twice', async () => {
    await service.scorePass(project, run, equiPass, []);
    const sql = insertSql();
    // `match_decisions` is unique per (org, project, left_source_ref,
    // left_key, right_source_ref, right_key), so one key pair can have more
    // than one row -- both key orders, or two source refs. Joined raw, each
    // extra row duplicates the candidate pair and corrupts the inserted
    // count. One row per normalized pair, latest decision winning.
    expect(sql).toContain('GROUP BY least("left_key", "right_key"), greatest("left_key", "right_key")');
    expect(sql).toContain('(array_agg("decision" ORDER BY "created_at" DESC, "id" DESC))[1]');
  });

  it('writes per-field feature scores into the features column', async () => {
    await service.scorePass(project, run, equiPass, []);
    const sql = insertSql();
    expect(sql).toContain('jsonb_build_object');
    // Every comparator of every mapped field, not just the primary one that
    // feeds the weighted score.
    expect(sql).toContain(`'surname_trgm'`);
    expect(sql).toContain(`'surname_lev'`);
    expect(sql).toContain(`'surname_tokenset'`);
    expect(sql).toContain(`'dob_daydiff'`);
    // One jsonb_build_object per field, concatenated: PostgreSQL's
    // FUNC_MAX_ARGS is 100, so a single call would break a project with
    // 17+ text fields (3 comparators each = 102 arguments).
    expect(sql.match(/jsonb_build_object\(/g)).toHaveLength(project.fieldMap.length);
    expect(sql).toMatch(/\) \|\| jsonb_build_object\(/);
  });

  it('is idempotent for a re-run of the same pass', async () => {
    await service.scorePass(project, run, equiPass, []);
    expect(insertSql()).toContain('ON CONFLICT ("run_id", "left_key", "right_key") DO NOTHING');
  });

  it('runs the pass session settings, the count and the insert in one transaction (Ruling R21)', async () => {
    await service.scorePass(project, run, trigramPass, []);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(3);
    // SET LOCAL is transaction-scoped: it must come first, and it must be
    // inside the same transaction as the two statements it governs, or the
    // `%` operator silently drops pairs the recheck would have kept.
    expect(String(query.mock.calls[0][0])).toBe('SET LOCAL pg_trgm.similarity_threshold = 0.4');
    expect(insideTransaction).toEqual([true, true, true]);
    // An equi pass has no session requirement and must not gain a statement.
    jest.clearAllMocks();
    await service.scorePass(project, run, equiPass, []);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('counts exactly the candidate set it scores', async () => {
    const blocking = new BlockingService(dataSource as never, materialize as never);
    const pairsSql = blocking.candidatePairsSql(project, equiPass, []);
    await service.scorePass(project, run, equiPass, []);
    // Both statements embed the identical candidate-pair SQL, so
    // `autoReject = total - inserted` is arithmetic over one candidate set
    // rather than a difference between two subtly different ones.
    expect(String(query.mock.calls[0][0])).toContain(pairsSql);
    expect(insertSql()).toContain(pairsSql);
    // The re-join back to the workspace table (needed to bring the field
    // columns into scope for the comparators) is on the primary key, so it
    // cannot multiply or drop a candidate pair.
    expect(insertSql()).toContain('JOIN matching.p_p1_left l ON l."src_key" = p.left_key');
    expect(insertSql()).toContain('JOIN matching.p_p1_left r ON r."src_key" = p.right_key');
  });

  it('numbers its own bind parameters after the dropped keys and interpolates neither', async () => {
    const droppedKeys = ['', 'MKMN|1988'];
    await service.scorePass(project, run, equiPass, droppedKeys);

    const countSql = String(query.mock.calls[0][0]);
    const countParams = (query.mock.calls[0][1] ?? []) as unknown[];
    expect(countParams).toEqual(droppedKeys);

    const [sql, params] = insertCall();
    expect(params.slice(0, 2)).toEqual(droppedKeys);
    // A dropped key can be a surname. It is a bound value, never SQL text.
    expect(sql).not.toContain('MKMN|1988');
    expect(countSql).not.toContain('MKMN|1988');

    // PostgreSQL binds by position: every placeholder the statement uses
    // must have a value, and every value must have a placeholder, or the
    // bind fails ("supplies N parameters, but prepared statement requires
    // M"). Off-by-one placeholder numbering after the dropped-key block is
    // exactly the defect this checks.
    for (const [statement, values] of [
      [countSql, countParams],
      [sql, params],
    ] as Array<[string, unknown[]]>) {
      const used = new Set([...statement.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
      expect([...used].sort((a, b) => a - b)).toEqual(values.map((_, i) => i + 1));
    }
  });

  it('scores both sides of the dedupe self-join against the same workspace column', async () => {
    // A link-mode field map may name a different right-hand column, but the
    // dedupe workspace table only ever has the `left` column. Referencing
    // `r."family_name"` would abort the whole pass with "column does not
    // exist".
    const renamed = {
      ...project,
      fieldMap: [{ left: 'surname', right: 'family_name', role: 'person_name', weight: 1, comparator: 'trgm' }],
    } as unknown as MatchProject;
    await service.scorePass(renamed, run, equiPass, []);
    const sql = insertSql();
    expect(sql).toContain('l."surname"');
    expect(sql).toContain('r."surname"');
    expect(sql).not.toContain('family_name');
  });

  it('casts the weighted score to double precision so it cannot be NULL or an integer division', async () => {
    await service.scorePass(project, run, equiPass, []);
    const sql = insertSql();
    expect(sql).toContain(')::double precision AS score');
    // The full weight sum is the denominator (Ruling R6) -- 0.5 + 0.3, not
    // the weight of whichever fields happen to be present on a pair.
    expect(sql).toContain('/ 0.8');
  });

  it('writes the run and organization onto every candidate row', async () => {
    await service.scorePass(project, run, equiPass, []);
    const [sql, params] = insertCall();
    expect(sql).toContain(
      'INSERT INTO "match_candidates" ("organization_id", "run_id", "left_key", "right_key", "blocking_pass", "features", "score", "decision")',
    );
    expect(params).toContain('run1');
    expect(params).toContain('org1');
    expect(params).toContain('name_dob');
  });

  it('refuses a project that is not a dedupe project', async () => {
    const link = { ...project, mode: 'link' } as unknown as MatchProject;
    await expect(service.scorePass(link, run, equiPass, [])).rejects.toThrow(/dedupe/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a run belonging to another organization or project', async () => {
    const otherOrg = { ...run, organizationId: 'org2' } as unknown as MatchRun;
    await expect(service.scorePass(project, otherOrg, equiPass, [])).rejects.toThrow(/organization/i);
    const otherProject = { ...run, projectId: 'p2' } as unknown as MatchRun;
    await expect(service.scorePass(project, otherProject, equiPass, [])).rejects.toThrow(/project/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses thresholds that are not usable numbers', async () => {
    const bad = { ...project, thresholds: { matchAt: 0.4, rejectAt: 0.9 } } as unknown as MatchProject;
    await expect(service.scorePass(bad, run, equiPass, [])).rejects.toThrow(/rejectAt/);
    const nan = { ...project, thresholds: { matchAt: 'high', rejectAt: 0.5 } } as unknown as MatchProject;
    await expect(service.scorePass(nan, run, equiPass, [])).rejects.toThrow(/matchAt/);
    expect(query).not.toHaveBeenCalled();
  });
});
