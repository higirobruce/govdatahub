'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import type { MatchCandidateDto, MatchProjectDto, MatchRunDto, MatchSourceRef, MatchVerdict } from '@/lib/api';
import { RecordDiff, isRecordPairUnavailable } from '@/components/Matching/RecordDiff';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { ArrowLeft, Check, ClipboardList, Loader2, SkipForward, Undo2, X } from 'lucide-react';

const PAGE_SIZE = 50;

/**
 * Mirrors `CrosswalkService.sourceRef` (backend) byte-for-byte -- the
 * frontend has no other way to produce the exact string `SubmitDecisionDto`
 * requires, since the candidates endpoint returns only keys, never a
 * source ref. Phase 1 is dedupe-only, so a candidate's left and right sides
 * both come from `project.leftSource`.
 */
function sourceRef(source: MatchSourceRef): string {
  if (source.kind === 'connection') {
    return `connection:${source.connectionId}:${source.schemaName}.${source.tableName}`;
  }
  return `staged:${source.stagedDataId}`;
}

interface LastDecision {
  candidate: MatchCandidateDto;
  index: number;
}

export default function ReviewQueuePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  // Relies on this page rendering dynamically -- see app/query/page.tsx's
  // identical note on useSearchParams() and Next's static-prerender rules.
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId');
  const { showToast } = useToast();

  const { data: project } = useSWR<MatchProjectDto>(
    `/matching/projects/${projectId}`,
    () => api.matching.getProject(projectId),
  );
  const { data: run, error: runError } = useSWR<MatchRunDto>(runId ? `/matching/runs/${runId}` : null, () =>
    api.matching.getRun(runId!),
  );

  const [globalIndex, setGlobalIndex] = useState(0);
  const [pages, setPages] = useState<Record<number, MatchCandidateDto[]>>({});
  const [loadingOffset, setLoadingOffset] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null);
  // Ruling R44: `globalIndex` is cursor position in the queue, not a count
  // of certified decisions -- it advances on skip too, and resets to 0 on
  // reload while already-certified pairs are still re-served (recording a
  // decision does not change `match_candidates.decision`). This counter is
  // the only thing on this screen that actually counts decisions made, and
  // it is intentionally session-scoped rather than a fake "reviewed" total.
  const [sessionDecisionCount, setSessionDecisionCount] = useState(0);

  const currentOffset = Math.floor(globalIndex / PAGE_SIZE) * PAGE_SIZE;
  const currentPage = pages[currentOffset];
  const localIndex = globalIndex - currentOffset;
  const currentCandidate = currentPage?.[localIndex];
  // Only the last page fetched can tell us we've run out of grey pairs: a
  // page shorter than PAGE_SIZE has no more rows after it.
  const queueExhausted = !!currentPage && currentPage.length < PAGE_SIZE && localIndex >= currentPage.length;

  useEffect(() => {
    if (!runId || pages[currentOffset] !== undefined || loadingOffset === currentOffset) return;
    let cancelled = false;
    setLoadingOffset(currentOffset);
    api.matching
      .listCandidates(runId, 'grey', PAGE_SIZE, currentOffset)
      .then((data) => {
        if (!cancelled) setPages((prev) => ({ ...prev, [currentOffset]: data }));
      })
      .catch((err: any) => {
        if (!cancelled) showToast(err.message || 'Failed to load candidates', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingOffset(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, currentOffset]);

  const leftRef = useMemo(() => (project ? sourceRef(project.leftSource) : null), [project]);

  const moveNext = useCallback(() => setGlobalIndex((idx) => idx + 1), []);
  const movePrev = useCallback(() => setGlobalIndex((idx) => Math.max(0, idx - 1)), []);

  const decide = useCallback(
    async (verdict: MatchVerdict, candidate: MatchCandidateDto, index: number) => {
      if (!leftRef || isRecordPairUnavailable(candidate.left_record, candidate.right_record)) return;
      setSubmitting(true);
      try {
        await api.matching.submitDecision(projectId, {
          leftSourceRef: leftRef,
          leftKey: candidate.left_key,
          rightSourceRef: leftRef,
          rightKey: candidate.right_key,
          decision: verdict,
        });
        setLastDecision({ candidate, index });
        setSessionDecisionCount((c) => c + 1);
        setGlobalIndex(index + 1);
      } catch (err: any) {
        showToast(err.message || 'Failed to record decision', 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [leftRef, projectId, showToast],
  );

  const undo = useCallback(async () => {
    // Ruling R43 (part 2): "undo" RETRACTS the previous pair's decision --
    // it does not submit the opposite verdict. `ScoringService` honours a
    // stored verdict regardless of score (R23) and turns `'no_match'` into
    // a permanent `'rejected'` state (R25): a verdict is a durable
    // override, not a note. Submitting the opposite here would turn a
    // mis-keyed `m` into a steward-attributed certification that two
    // records are NOT the same entity -- exactly what this screen must
    // never manufacture. Retracting deletes the decision row instead, so
    // the pair returns to whatever the score alone makes it.
    //
    // Retracting only has something to do when the very last action was a
    // decision we haven't already moved away from -- otherwise (the
    // previous pair was skipped, or this is already the start of the
    // queue) it degrades to a plain step back, same as `k`.
    if (!lastDecision || lastDecision.index !== globalIndex - 1) {
      movePrev();
      return;
    }
    setSubmitting(true);
    try {
      await api.matching.retractDecision(projectId, lastDecision.candidate.left_key, lastDecision.candidate.right_key);
      setGlobalIndex(lastDecision.index);
      setLastDecision(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to undo', 'error');
    } finally {
      setSubmitting(false);
    }
  }, [lastDecision, globalIndex, projectId, showToast, movePrev]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      // OS/browser chords (Cmd+M minimize, Ctrl+N new window, Alt+M, ...)
      // deliver the same `e.key` as the bare letter. Without this check
      // one of those chords records a permanent, steward-attributed
      // verdict -- exactly the mis-keyed-press risk this screen's retract
      // design already exists to mitigate.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (submitting || !currentCandidate) return;

      switch (e.key) {
        case 'j':
          moveNext();
          break;
        case 'k':
          movePrev();
          break;
        case 's':
          moveNext();
          break;
        case 'u':
          void undo();
          break;
        case 'm':
          void decide('match', currentCandidate, globalIndex);
          break;
        case 'n':
          void decide('no_match', currentCandidate, globalIndex);
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentCandidate, globalIndex, submitting, moveNext, movePrev, undo, decide]);

  if (!runId) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-8 text-center">
          <p className="text-sm text-[#1a1a1a] font-medium mb-1">No run selected</p>
          <p className="text-sm text-[#aaaaaa] mb-4">
            Open the project page and choose Review from a completed run.
          </p>
          <Button asChild>
            <Link href={`/matching/${projectId}`}>Back to project</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (runError) {
    return (
      <div className="w-full">
        <div className="p-6 text-sm text-red-700">Failed to load run: {runError.message}</div>
      </div>
    );
  }

  const greyTotal = run?.counters.grey ?? null;
  const recordsUnavailable =
    !!currentCandidate && isRecordPairUnavailable(currentCandidate.left_record, currentCandidate.right_record);
  const canDecide = !submitting && !!currentCandidate && !!leftRef && !recordsUnavailable;
  // Why Match/No match are disabled, for the button `title`s below -- a
  // disabled control with no explanation ("Match (m)") is as opaque as no
  // control at all. `submitting` isn't listed: that state is momentary and
  // self-explanatory (the "Saving…" indicator already covers it).
  const decideDisabledReason = recordsUnavailable
    ? 'Record values are no longer available for this pair -- press s to skip it'
    : !leftRef
      ? 'Waiting for the project to finish loading'
      : null;

  return (
    <div className="w-full">
      <div className="mb-3">
        <Link
          href={`/matching/${projectId}/runs/${runId}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#777777] hover:text-[#1a1a1a] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to run summary
        </Link>
      </div>

      <PageHeader title="Review queue" subtitle="Grey-band pairs, highest score first" icon={ClipboardList} />

      {greyTotal !== null && greyTotal > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-[#555555] mb-1.5">
            <span>
              Pair {Math.min(globalIndex + 1, greyTotal).toLocaleString()} of {greyTotal.toLocaleString()} in the
              grey band
            </span>
            <div className="flex items-center gap-3">
              {/* Ruling R44: this is the only "reviewed" count on the page that is
                  actually true -- decisions recorded this session. `globalIndex`
                  above is cursor position (it advances on skip, and resets on
                  reload while certified pairs are re-served), so it cannot stand
                  in for progress without overstating it. */}
              <span className="text-xs text-[#aaaaaa]">
                {sessionDecisionCount.toLocaleString()} decision{sessionDecisionCount === 1 ? '' : 's'} made this
                session
              </span>
              {submitting && (
                <span className="text-xs text-[#aaaaaa] flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
            </div>
          </div>
          <Progress value={Math.min(100, ((globalIndex + 1) / greyTotal) * 100)} className="h-1.5" />
        </div>
      )}

      {greyTotal === 0 && (
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-8 text-center">
          <p className="text-sm text-[#1a1a1a] font-medium">Nothing to review</p>
          <p className="text-sm text-[#aaaaaa] mt-1">
            Every candidate pair in this run was resolved automatically — none fell in the grey band.
          </p>
        </div>
      )}

      {greyTotal !== null && greyTotal > 0 && queueExhausted && (
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-8 text-center">
          <p className="text-sm text-[#1a1a1a] font-medium">All caught up</p>
          <p className="text-sm text-[#aaaaaa] mt-1">
            You&rsquo;ve stepped past the last grey-band pair returned for this run.
          </p>
          <Button variant="outline" className="mt-4" onClick={movePrev}>
            Step back
          </Button>
        </div>
      )}

      {greyTotal !== null && greyTotal > 0 && !queueExhausted && (
        <>
          {!currentCandidate && (
            <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-8 text-center text-sm text-[#aaaaaa]">
              Loading…
            </div>
          )}

          {currentCandidate && project && (
            <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-[#555555]">
                    Score <span className="font-semibold text-[#1a1a1a]">{currentCandidate.score.toFixed(3)}</span>
                  </span>
                  <span className="text-[#555555]">
                    Proposed by{' '}
                    <span className="font-mono text-xs bg-[#f5f5f5] text-[#555555] px-1.5 py-0.5 rounded">
                      {currentCandidate.blocking_pass}
                    </span>
                  </span>
                </div>
              </div>

              <RecordDiff
                fieldMap={project.fieldMap}
                features={currentCandidate.features}
                leftRecord={currentCandidate.left_record}
                rightRecord={currentCandidate.right_record}
                leftLabel={`Record ${currentCandidate.left_key}`}
                rightLabel={`Record ${currentCandidate.right_key}`}
              />

              <div className="flex items-center justify-center gap-3 mt-6">
                <Button variant="outline" disabled={submitting} onClick={movePrev} title="Previous pair (k)">
                  Previous
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5 border-red-200 text-red-700 hover:bg-red-50"
                  disabled={!canDecide}
                  onClick={() => currentCandidate && decide('no_match', currentCandidate, globalIndex)}
                  title={decideDisabledReason ?? 'No match (n)'}
                >
                  <X className="h-4 w-4" />
                  No match
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={submitting}
                  onClick={moveNext}
                  title="Skip (s)"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip
                </Button>
                <Button
                  className="gap-1.5 bg-green-700 hover:bg-green-800"
                  disabled={!canDecide}
                  onClick={() => currentCandidate && decide('match', currentCandidate, globalIndex)}
                  title={decideDisabledReason ?? 'Match (m)'}
                >
                  <Check className="h-4 w-4" />
                  Match
                </Button>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  disabled={submitting}
                  onClick={() => void undo()}
                  title="Retract the previous decision -- returns it to the grey band, does not reverse it (u)"
                >
                  <Undo2 className="h-4 w-4" />
                  Undo
                </Button>
              </div>

              <p className="text-center text-xs text-[#aaaaaa] mt-4">
                Keyboard: <span className="font-mono">m</span> match · <span className="font-mono">n</span> no
                match · <span className="font-mono">s</span> skip · <span className="font-mono">u</span> undo ·{' '}
                <span className="font-mono">j</span>/<span className="font-mono">k</span> move
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
