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

/** One row of `match_candidates`, as read for cluster-building or the over-merge guard. */
interface CandidateRow {
  left_key: string;
  right_key: string;
  score: number;
  decision: CandidateDecision;
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
    const survivorRows: CandidateRow[] = await this.dataSource.query(
      `SELECT left_key, right_key, score, decision FROM match_candidates ` +
        `WHERE run_id = $1 AND decision IN ('auto_match', 'confirmed')`,
      [run.id],
    );

    const pairs: Array<[string, string]> = survivorRows.map((row) => [row.left_key, row.right_key]);
    const groups = unionFind(pairs);
    const sourceRef = this.buildSourceRef(project);

    let flaggedCount = 0;
    for (const members of groups.values()) {
      const flagged = await this.isOverMerged(run.id, members, project.thresholds.rejectAt);
      if (flagged) flaggedCount += 1;

      const entityKey = await this.resolveEntityKey(project, members);

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
   * The over-merge guard, as amended by Ruling R26.
   *
   * Reads every stored pair between two members of `members`, not all
   * `n*(n-1)/2` combinations: the row count actually returned is compared
   * against that closed-form expected count, so a missing pair is
   * detected without ever materializing the combinations that would
   * reveal *which* one is missing. That keeps this comparison linear in
   * what Postgres returns rather than quadratic in cluster size. The
   * quadratic cost that remains -- inspecting every pair that *is*
   * present -- is inherent to "check every internal pair," not an
   * artifact of how this is written, and the loop below still
   * short-circuits on the first disqualifying row rather than scanning
   * to the end.
   *
   * `decision` governs the guard, not `score` alone (Ruling R26):
   *  - `confirmed` clears the threshold test outright, whatever the score.
   *  - `rejected` is a hard split -- flags the cluster no matter how high
   *    the score, because a person has said these are different entities.
   *  - anything else falls back to the plain score test.
   *  - a pair absent from the table scored below `rejectAt` and was
   *    discarded, so absence flags the cluster too.
   */
  private async isOverMerged(runId: string, members: string[], rejectAt: number): Promise<boolean> {
    if (members.length < 2) return false;

    const expectedPairs = (members.length * (members.length - 1)) / 2;
    const rows: CandidateRow[] = await this.dataSource.query(
      `SELECT left_key, right_key, score, decision FROM match_candidates ` +
        `WHERE run_id = $1 AND left_key = ANY($2::text[]) AND right_key = ANY($2::text[])`,
      [runId, members],
    );

    if (rows.length < expectedPairs) return true;

    for (const row of rows) {
      if (row.decision === 'confirmed') continue;
      if (row.decision === 'rejected') return true;
      if (row.score < rejectAt) return true;
    }
    return false;
  }

  /**
   * The `entity_key` a re-run keeps: whichever key the cluster's previous
   * members held in the majority, tied broken to the lexicographically
   * smallest key so the result is deterministic regardless of row order.
   * Mints a fresh `uuidv4()` only when none of the members has ever
   * appeared in the crosswalk.
   *
   * Scoped by `organization_id` and `project_id` only -- not `source_ref`
   * -- per the ruling in the brief: a dedupe project has exactly one
   * Match Source, so project scoping is sufficient, and this keeps this
   * task independent of `CrosswalkService.sourceRef()` (Task 10), which
   * does not exist yet.
   */
  private async resolveEntityKey(project: MatchProject, members: string[]): Promise<string> {
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
    return best as string;
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
