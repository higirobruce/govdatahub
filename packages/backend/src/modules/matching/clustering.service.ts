import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MatchEntity } from '../../database/entities';
import type { CandidateDecision, MatchProject, MatchRun } from '../../database/entities';

export interface ClusterResult {
  clusters: number;
  flagged: number;
}

/** One row of `match_candidates`, as read for building the union-find edge list. */
interface CandidateRow {
  left_key: string;
  right_key: string;
  score: number;
  decision: CandidateDecision;
}

/**
 * The over-merge guard's single aggregate row over a cluster's internal
 * pairs -- see `isOverMerged`. All three fields arrive as strings (`count(*)`
 * over the wire), hence `unknown` here and `toCount` at the read site.
 */
interface GuardCountRow {
  total: unknown;
  n_rejected: unknown;
  n_low: unknown;
}

/** One row of `match_crosswalk`, as read for the majority entity-key lookup. */
interface CrosswalkRow {
  source_key: string;
  entity_key: string;
}

/**
 * Union-find (disjoint-set) over an edge list, path-compressed and
 * union-by-size so a cluster of thousands of members stays close to
 * linear rather than degenerating into a list traversal. Exported for
 * direct testing.
 *
 * Two edge cases that a three-node fixture would never exercise:
 *  - A pair whose two keys are identical (`['a', 'a']`) unions a node with
 *    itself. `find(a) === find(a)`, so `union` is a no-op -- not an error,
 *    not an infinite loop.
 *  - `find` is iterative with a second pass for path compression, not
 *    recursive, so a long chain (`a-b`, `b-c`, `c-d`, ...) cannot blow the
 *    call stack the way a recursive implementation would at scale.
 *
 * A key that never appears in any pair is never inserted, and is absent
 * from the result entirely -- this function clusters the *survivors* of
 * scoring; a key with no surviving pair has nothing to be clustered into.
 */
export function unionFind(pairs: Array<[string, string]>): Map<string, string[]> {
  const parent = new Map<string, string>();
  const size = new Map<string, number>();

  const makeSet = (x: string): void => {
    if (!parent.has(x)) {
      parent.set(x, x);
      size.set(x, 1);
    }
  };

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    const sa = size.get(ra) as number;
    const sb = size.get(rb) as number;
    if (sa < sb) {
      parent.set(ra, rb);
      size.set(rb, sa + sb);
    } else {
      parent.set(rb, ra);
      size.set(ra, sa + sb);
    }
  };

  for (const [a, b] of pairs) {
    makeSet(a);
    makeSet(b);
    union(a, b);
  }

  const groups = new Map<string, string[]>();
  for (const key of parent.keys()) {
    const root = find(key);
    let group = groups.get(root);
    if (!group) {
      group = [];
      groups.set(root, group);
    }
    group.push(key);
  }
  return groups;
}

/**
 * Turns the survivors of scoring (`auto_match` and `confirmed` candidate
 * pairs) into entities: clusters them with union-find, guards each
 * cluster against over-merging (Ruling R26), assigns a stable entity key,
 * and saves the result to `match_entities`.
 *
 * This is the stage that decides "these records are one person." Merging
 * two different citizens is worse than failing to merge one person's
 * duplicate records, so every close call here (a missing pair, a tie, an
 * unusual decision) resolves toward flagging or leaving things apart, not
 * toward a confident merge.
 *
 * Phase 1, dedupe-only, zero model calls. Golden-record population
 * (survivorship) is phase 3 and is deliberately not touched here.
 */
@Injectable()
export class ClusteringService {
  private readonly logger = new Logger(ClusteringService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MatchEntity) private readonly entityRepo: Repository<MatchEntity>,
  ) {}

  async cluster(project: MatchProject, run: MatchRun): Promise<ClusterResult> {
    // Ruling R55: `organization_id` is bound even though `run_id` alone
    // already identifies this run's rows uniquely. Every other raw-SQL
    // access on this feature carries the organization predicate, and the
    // one query that does not is the one a future refactor will trust --
    // the moment a run id arrives from anywhere but an org-scoped load,
    // this is the statement that would silently read another tenant's
    // candidates.
    const survivorRows: CandidateRow[] = await this.dataSource.query(
      `SELECT left_key, right_key, score, decision FROM match_candidates ` +
        `WHERE run_id = $1 AND organization_id = $2 AND decision IN ('auto_match', 'confirmed')`,
      [run.id, project.organizationId],
    );

    const pairs: Array<[string, string]> = survivorRows.map((row) => [row.left_key, row.right_key]);
    const groups = unionFind(pairs);
    const sourceRef = this.buildSourceRef(project);
    const orderedClusters = this.inStableOrder(groups);

    // Ruling R49: an entity key belongs to at most one cluster per run.
    const claimedKeys = new Set<string>();

    let flaggedCount = 0;
    for (const members of orderedClusters) {
      const flagged = await this.isOverMerged(project, run.id, members, project.thresholds.rejectAt);
      if (flagged) flaggedCount += 1;

      const entityKey = await this.resolveEntityKey(project, members, claimedKeys);
      claimedKeys.add(entityKey);

      await this.entityRepo.save({
        id: uuidv4(),
        organizationId: project.organizationId,
        projectId: project.id,
        runId: run.id,
        entityKey,
        members: members.map((sourceKey) => ({ sourceRef, sourceKey })),
        golden: {},
        size: members.length,
        flagged,
      });
    }

    this.logger.log(
      `Run ${run.id}: ${groups.size} clusters, ${flaggedCount} flagged for over-merge review`,
    );

    return { clusters: groups.size, flagged: flaggedCount };
  }

  /**
   * Ruling R49 needs a deterministic processing order, because which
   * cluster gets to keep a contested entity key is now decided by which
   * one is reached first. `unionFind` returns a `Map` keyed by whichever
   * node happened to become the root, iterated in insertion order --
   * which is the order `match_candidates` rows arrived in, and an
   * unordered `SELECT` gives PostgreSQL no obligation to repeat that.
   * Two runs over identical data could therefore have assigned the same
   * two clusters each other's keys.
   *
   * So: members sorted within a cluster, clusters sorted by their first
   * (therefore smallest) member. Every cluster is disjoint, so no two
   * clusters share a smallest member and the ordering is total. Sorting
   * the members also makes the persisted `members` array itself stable
   * run to run, which nothing depended on before and several things read
   * now.
   */
  private inStableOrder(groups: Map<string, string[]>): string[][] {
    const clusters = [...groups.values()].map((members) => [...members].sort());
    clusters.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return clusters;
  }

  /**
   * The over-merge guard, as amended by Ruling R26.
   *
   * A single server-side aggregate, not one row per internal pair. An
   * earlier version of this guard fetched every stored pair between two
   * members of `members` and looped over them in JavaScript -- correct,
   * but `O(n^2)` in returned data: a common-surname block (an ordinary
   * shape in a citizen registry, not an adversarial one) can legitimately
   * produce a near-complete pairwise candidate set, and a 10,000-member
   * cluster has up to ~50,000,000 internal pairs to transfer, JSON-parse
   * and materialize as arrays before a single comparison ran. That is the
   * same shape as Ruling R22's per-key histogram: aggregate server-side,
   * return only the three numbers the verdict actually depends on.
   *
   * `total` answers the missing-pair question (a shortfall against the
   * closed-form `n*(n-1)/2` expected count means at least one pair was
   * never stored, and absence flags the cluster). `n_rejected` and
   * `n_low` answer the R26 decision-aware score test:
   *  - `confirmed` rows count toward `total` (they are present) but are
   *    excluded from both `n_rejected` and `n_low` -- they clear the
   *    threshold test outright, whatever the score.
   *  - `rejected` rows always count toward `n_rejected`, regardless of
   *    score -- a hard split, because a person has said these are
   *    different entities.
   *  - every other decision falls back to the plain score test via
   *    `n_low` (`decision <> 'confirmed' AND score < rejectAt`; a
   *    `rejected` row can also satisfy this, which is harmless since
   *    `n_rejected` already flags it).
   * Flagging on `n_rejected > 0 OR n_low > 0` is exactly equivalent to
   * "any internal pair fails its individual test" -- it does not change
   * the verdict versus inspecting every row, only where the inspection
   * happens. The guard is `O(1)` in returned data regardless of cluster
   * size.
   */
  private async isOverMerged(
    project: MatchProject,
    runId: string,
    members: string[],
    rejectAt: number,
  ): Promise<boolean> {
    if (members.length < 2) return false;

    const expectedPairs = (members.length * (members.length - 1)) / 2;
    // Ruling R55: organization-scoped, for the same reason as the
    // survivor read above. It is bound as `$4` rather than inserted
    // earlier so the members array stays `$2` -- this guard is the
    // statement whose parameter positions the tests route on.
    const rows: GuardCountRow[] = await this.dataSource.query(
      `SELECT count(*) AS total,\n` +
        `       count(*) FILTER (WHERE decision = 'rejected') AS n_rejected,\n` +
        `       count(*) FILTER (WHERE decision <> 'confirmed' AND score < $3::double precision) AS n_low\n` +
        `FROM match_candidates\n` +
        `WHERE run_id = $1 AND organization_id = $4 ` +
        `AND left_key = ANY($2::text[]) AND right_key = ANY($2::text[])`,
      [runId, members, rejectAt, project.organizationId],
    );

    const row = rows[0];
    const total = this.toCount(row?.total, 'internal-pair total');
    const nRejected = this.toCount(row?.n_rejected, 'rejected-pair count');
    const nLow = this.toCount(row?.n_low, 'low-score-pair count');

    return total < expectedPairs || nRejected > 0 || nLow > 0;
  }

  /**
   * PostgreSQL returns `count(*)` as a string over the wire. Parsed and
   * validated before any comparison: a malformed count throws rather
   * than silently coercing to `NaN`, which would make every `<`/`>`
   * comparison against it false and the guard would clear a cluster it
   * could not actually evaluate.
   */
  private toCount(value: unknown, what: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Clustering guard returned a non-numeric ${what}: ${JSON.stringify(value)}`);
    }
    return parsed;
  }

  /**
   * The `entity_key` a re-run keeps: whichever key the cluster's previous
   * members held in the majority, ties broken to the lexicographically
   * smallest key so the result is deterministic regardless of row order.
   * Mints a fresh `uuidv4()` when none of the members has ever appeared
   * in the crosswalk.
   *
   * **A key is claimed by at most one cluster per run (Ruling R49).**
   * `claimedKeys` carries what this same run has already assigned, and a
   * cluster whose majority winner is already in it mints a fresh key
   * instead. Without that record two clusters of one run could both take
   * the same key, and the case where they do is the worst possible one:
   * run 1 clusters A, B and C under key E; a steward rejects (A,C) and
   * (B,C); run 2 produces {A,B} (two votes for E) and {C,D} (one vote for
   * E), both resolve to E, and all four records publish under one key --
   * MORE merged than before the steward intervened, as a direct result of
   * their correction. Minting for the loser is not a fallback, it is the
   * right answer: a fragment that has just been split off is a new
   * identity, and the alternative -- reusing a key some other cluster
   * holds -- is the merge the split existed to undo.
   *
   * Which cluster keeps the contested key is therefore load-bearing, and
   * `cluster` fixes it by processing clusters in `inStableOrder`. The
   * larger fragment does not automatically win; the first one in that
   * order does. That is deliberate: "largest wins" would be a different
   * rule that still has to break its own ties, and neither rule is more
   * correct than the other -- what matters is that the same input always
   * produces the same assignment.
   *
   * Scoped by `organization_id` and `project_id` only -- not `source_ref`
   * -- because a dedupe project has exactly one Match Source, so project
   * scoping selects the same rows.
   */
  private async resolveEntityKey(
    project: MatchProject,
    members: string[],
    claimedKeys: Set<string>,
  ): Promise<string> {
    const rows: CrosswalkRow[] = await this.dataSource.query(
      `SELECT source_key, entity_key FROM match_crosswalk ` +
        `WHERE organization_id = $1 AND project_id = $2 AND source_key = ANY($3::text[])`,
      [project.organizationId, project.id, members],
    );

    if (rows.length === 0) return uuidv4();

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.entity_key, (counts.get(row.entity_key) ?? 0) + 1);
    }

    let best: string | null = null;
    let bestCount = -1;
    for (const [key, count] of counts) {
      if (best === null || count > bestCount || (count === bestCount && key < best)) {
        best = key;
        bestCount = count;
      }
    }
    if (best === null || claimedKeys.has(best)) return uuidv4();
    return best;
  }

  /**
   * `'connection:<connectionId>:<schema>.<table>'` or
   * `'staged:<stagedDataId>'`, built inline because Task 10
   * (`CrosswalkService.sourceRef()`) does not exist yet. Both must
   * produce byte-identical strings for the same source, or the Crosswalk
   * cannot be joined back to the clusters it came from.
   *
   * A dedupe project has exactly one Match Source (`leftSource`); there
   * is no right-side handling here by design -- `rightSource` is null for
   * every dedupe project and reading it would be scope creep into
   * link-mode, which phase 1 does not support.
   */
  private buildSourceRef(project: MatchProject): string {
    const source = project.leftSource;
    if (source.kind === 'connection') {
      return `connection:${source.connectionId}:${source.schemaName}.${source.tableName}`;
    }
    return `staged:${source.stagedDataId}`;
  }
}
