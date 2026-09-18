import type { FieldMapping, FieldRole } from '@/lib/api';

interface RecordDiffProps {
  /** The project's field map — the same rows the run scored against. */
  fieldMap: FieldMapping[];
  /** The candidate's `features` — one score per `<column>_<comparator>`, already in [0,1] (Ruling R2, never rescale). */
  features: Record<string, number>;
  /**
   * `null` when the workspace copy no longer holds this row — either the
   * retention sweep cleared the whole workspace, or this row alone is gone
   * because the source changed since the run compared it. The two arrive
   * identically here, so neither this doc nor the panel may assert which
   * one happened (Ruling R46). Renders an explanation, not a blank diff.
   */
  leftRecord: Record<string, unknown> | null;
  rightRecord: Record<string, unknown> | null;
  leftLabel?: string;
  rightLabel?: string;
}

type DiffSegment = { text: string; changed: boolean };

/**
 * True when either side of the pair is missing and this component will
 * refuse to render a diff (see the guard in `RecordDiff` below). Callers
 * that gate their own controls on record availability -- the review
 * queue's `decide()`/`canDecide` -- MUST derive their check from this
 * exact predicate rather than re-testing `left_record`/`right_record`
 * themselves, so the disabled state on those controls can never drift
 * from what this component actually renders. This is the fix for the
 * finding that only `left_record` was checked: a pair whose *right* row
 * was missing rendered this "no longer available" panel while Match/No
 * match stayed armed.
 */
export function isRecordPairUnavailable(
  leftRecord: Record<string, unknown> | null,
  rightRecord: Record<string, unknown> | null,
): boolean {
  return leftRecord === null || rightRecord === null;
}

/**
 * The FIRST comparator PostgreSQL's `comparatorExprs` returns for a role is
 * the one `weightedScoreExpr` actually uses for the candidate's own score
 * (backend: `blocking-sql.ts:weightedScoreExpr`, `const [primary] =
 * comparatorExprs(...)`) — this mirrors that selection so the bar shown next
 * to each field is the score that field actually contributed, not one of
 * the other comparators `features` also carries. Kept in sync with
 * `app/matching/new/page.tsx`'s `defaultComparatorFor`, which makes the same
 * choice for the same reason at project-creation time.
 */
function primaryComparatorName(role: FieldRole): string {
  switch (role) {
    case 'person_name':
    case 'org_name':
    case 'text':
    case 'address':
      return 'trgm';
    case 'date':
      return 'daydiff';
    default:
      return 'exact';
  }
}

function pushSegment(segments: DiffSegment[], ch: string, changed: boolean): void {
  const last = segments[segments.length - 1];
  if (last && last.changed === changed) {
    last.text += ch;
  } else {
    segments.push({ text: ch, changed });
  }
}

/**
 * Character-level LCS diff: characters in `a`/`b` that are part of the
 * longest common subsequence render unchanged; everything else is marked
 * `changed`. O(n*m) time and space, which is fine for the field values this
 * renders (names, dates, ids — short strings, never a document body).
 */
function diffChars(a: string, b: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const left: DiffSegment[] = [];
  const right: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pushSegment(left, a[i], false);
      pushSegment(right, b[j], false);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushSegment(left, a[i], true);
      i++;
    } else {
      pushSegment(right, b[j], true);
      j++;
    }
  }
  while (i < n) {
    pushSegment(left, a[i], true);
    i++;
  }
  while (j < m) {
    pushSegment(right, b[j], true);
    j++;
  }
  return { left, right };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function DiffText({ segments }: { segments: DiffSegment[] }) {
  if (segments.length === 0) {
    return <span className="text-[#aaaaaa] italic">empty</span>;
  }
  return (
    <>
      {segments.map((seg, idx) =>
        seg.changed ? (
          <mark key={idx} className="bg-amber-200/70 text-[#1a1a1a] rounded-sm px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={idx}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function similarityColor(value: number): string {
  if (value >= 0.85) return '#4ade80';
  if (value >= 0.5) return '#fb923c';
  return '#ef4444';
}

function SimilarityBar({ value }: { value: number | undefined }) {
  if (value === undefined) {
    return <span className="text-xs text-[#aaaaaa]">—</span>;
  }
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2 w-24 flex-shrink-0">
      <div className="h-1.5 flex-1 rounded-full bg-[#f0f0f0] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: similarityColor(value) }}
        />
      </div>
      <span className="text-xs text-[#555555] w-9 text-right tabular-nums">{pct.toFixed(0)}%</span>
    </div>
  );
}

/**
 * Pure presentational component — no fetching. Renders one row per mapped
 * field: the field name, both values with differing characters
 * highlighted, and a similarity bar for that field's primary comparator.
 *
 * Both records are read by `field.left`, on both sides: phase 1 is
 * dedupe-only, so `left_record` and `right_record` are two rows of the same
 * materialized workspace table, which only ever has columns named by
 * `fieldMap[].left` (see `MaterializeService.materialize`) — `field.right`
 * has no column to read on either side yet.
 */
export function RecordDiff({
  fieldMap,
  features,
  leftRecord,
  rightRecord,
  leftLabel = 'Left record',
  rightLabel = 'Right record',
}: RecordDiffProps) {
  if (isRecordPairUnavailable(leftRecord, rightRecord)) {
    return (
      <div className="rounded-lg border border-dashed border-[#dddddd] bg-[#fafafa] p-6 text-center">
        <p className="text-sm font-medium text-[#1a1a1a]">Record values are no longer available</p>
        <p className="text-xs text-[#aaaaaa] mt-1 max-w-md mx-auto">
          The values behind this pair are no longer in DataGate&rsquo;s workspace copy &mdash; either it
          was cleared under this project&rsquo;s retention period, or these rows have changed in the
          source since the run compared them. The score below is still what the run computed; the
          field-by-field values behind it cannot be recovered.
        </p>
        <p className="text-xs text-[#aaaaaa] mt-2 max-w-md mx-auto">
          This pair cannot be certified. Press <span className="font-mono">s</span> (or use Skip) to
          move on.
        </p>
      </div>
    );
  }

  // `isRecordPairUnavailable` (a plain boolean check, not a TS type
  // predicate -- it also has to narrow nothing when called from the
  // review queue, which only ever passes it a boolean) already ruled out
  // null above; these two lines just carry that fact into the type
  // checker without duplicating the null test itself.
  const leftValues = leftRecord as Record<string, unknown>;
  const rightValues = rightRecord as Record<string, unknown>;

  return (
    <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
      <div className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_104px] gap-x-4 px-4 py-2 bg-[#f8f8f8] text-[11px] font-semibold text-[#aaaaaa] uppercase tracking-wide">
        <div>Field</div>
        <div>{leftLabel}</div>
        <div>{rightLabel}</div>
        <div>Similarity</div>
      </div>
      <div className="divide-y divide-[#eeeeee]">
        {fieldMap.map((field) => {
          const leftValue = formatValue(leftValues[field.left]);
          const rightValue = formatValue(rightValues[field.left]);
          const { left, right } = diffChars(leftValue, rightValue);
          const comparator = primaryComparatorName(field.role);
          const score = features[`${field.left}_${comparator}`];
          return (
            <div
              key={field.left}
              className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_104px] gap-x-4 px-4 py-2.5 items-center"
            >
              <div className="text-xs font-medium text-[#555555] truncate" title={field.left}>
                {field.left.replace(/_/g, ' ')}
              </div>
              <div className="text-sm text-[#1a1a1a] break-words">
                <DiffText segments={left} />
              </div>
              <div className="text-sm text-[#1a1a1a] break-words">
                <DiffText segments={right} />
              </div>
              <SimilarityBar value={score} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
