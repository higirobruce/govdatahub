'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import type { MatchClusterDto, MatchRunDto } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Database,
  Flag,
  Layers,
  ThumbsDown,
  Users,
} from 'lucide-react';

/**
 * A run summary reads this many clusters (the maximum page size the
 * clusters endpoint allows) to build the size histogram and the flagged
 * list. Clusters sort flagged-first, then largest-first, so every flagged
 * cluster is captured here unless a single run somehow produces more than
 * this many of them -- see the truncation notes below, which say so rather
 * than silently showing a partial picture as if it were complete.
 */
const SUMMARY_CLUSTER_SAMPLE = 500;

const RUN_STATUS_STYLES: Record<string, string> = {
  completed: 'text-green-700 bg-green-50',
  failed: 'text-red-700 bg-red-50',
  pending: 'text-[#777777] bg-[#f0f0f0]',
  materializing: 'text-amber-700 bg-amber-50',
  normalizing: 'text-amber-700 bg-amber-50',
  blocking: 'text-amber-700 bg-amber-50',
  scoring: 'text-amber-700 bg-amber-50',
  clustering: 'text-amber-700 bg-amber-50',
};

function clusterSizeBucket(size: number): string {
  if (size <= 4) return String(size);
  if (size <= 10) return '5–10';
  return '11+';
}

export default function MatchRunSummaryPage() {
  const params = useParams<{ id: string; runId: string }>();
  const projectId = params.id;
  const runId = params.runId;

  const { data: run, error: runError } = useSWR<MatchRunDto>(`/matching/runs/${runId}`, () =>
    api.matching.getRun(runId),
  );
  const { data: clusters, error: clustersError } = useSWR<MatchClusterDto[]>(
    `/matching/runs/${runId}/clusters?summary`,
    () => api.matching.listClusters(runId, SUMMARY_CLUSTER_SAMPLE, 0),
  );
  // Ruling R52: Review is only honest on the latest completed run, so
  // this page needs to know which run that is before it offers the link.
  const { data: runs } = useSWR<MatchRunDto[]>(`/matching/projects/${projectId}/runs`, () =>
    api.matching.listRuns(projectId),
  );
  // Runs come back startedAt DESC, so the first completed one is the latest.
  const latestCompletedRun = runs?.find((r) => r.status === 'completed') ?? null;
  const isLatestCompleted = !!latestCompletedRun && latestCompletedRun.id === runId;

  const histogram = useMemo(() => {
    if (!clusters) return [];
    const counts = new Map<string, number>();
    for (const cluster of clusters) {
      const bucket = clusterSizeBucket(cluster.size);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    const order = ['2', '3', '4', '5–10', '11+'];
    const maxCount = Math.max(1, ...Array.from(counts.values()));
    return order
      .filter((bucket) => counts.has(bucket))
      .map((bucket) => ({ bucket, count: counts.get(bucket)!, pct: (counts.get(bucket)! / maxCount) * 100 }));
  }, [clusters]);

  const flaggedClusters = useMemo(() => clusters?.filter((c) => c.flagged) ?? [], [clusters]);
  const sampleTruncated = !!clusters && !!run && clusters.length < run.counters.clusters;
  const flaggedTruncated = !!clusters && !!run && flaggedClusters.length < run.counters.flaggedClusters;

  if (runError) {
    return (
      <div className="w-full">
        <div className="p-6 text-sm text-red-700">Failed to load run: {runError.message}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3">
        <Link
          href={`/matching/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#777777] hover:text-[#1a1a1a] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to project
        </Link>
      </div>

      <PageHeader
        title="Run summary"
        subtitle={run ? `Started ${new Date(run.startedAt).toLocaleString()}` : 'Loading…'}
        icon={Database}
        actions={
          run && (
            <>
              {/*
                Ruling R52: the match workspace is per PROJECT and every run
                drops and rebuilds it, so the record values Review renders are
                always the CURRENT ones. Opening Review on an older run would
                put today's field values beside that run's old score and ask a
                steward to certify a pair against data the score was never
                computed from -- and the verdict they record is permanent.
                Versioned workspaces are phase-3 work; until then the link is
                offered only where it is truthful.
              */}
              {isLatestCompleted ? (
                <Button asChild variant="outline" className="gap-1.5">
                  <Link href={`/matching/${projectId}/review?runId=${run.id}`}>
                    <ClipboardList className="h-4 w-4" />
                    Review queue
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  className="gap-1.5"
                  title={
                    run.status === 'completed'
                      ? 'Review is only available on the latest completed run — the workspace it reads was rebuilt by a later run'
                      : 'Review becomes available once this run completes'
                  }
                >
                  <ClipboardList className="h-4 w-4" />
                  Review queue
                </Button>
              )}
              <Button asChild variant="outline" className="gap-1.5">
                <Link href={`/matching/${projectId}/clusters?runId=${run.id}`}>
                  <Layers className="h-4 w-4" />
                  Clusters
                </Link>
              </Button>
            </>
          )
        }
      />

      {run && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${RUN_STATUS_STYLES[run.status] ?? 'text-[#555555] bg-[#f5f5f5]'}`}
            >
              {run.status}
            </span>
            {run.errorMessage && <span className="text-sm text-red-700">{run.errorMessage}</span>}
          </div>

          {/* Ruling R52: say why, where the person who just found Review greyed out is looking. */}
          {run.status === 'completed' && !isLatestCompleted && latestCompletedRun && (
            <div className="mb-4 rounded-lg border border-[#e8e8e8] bg-[#fafafa] px-4 py-3 text-xs text-[#555555]">
              Review is disabled for this run. The match workspace is rebuilt from scratch by every run, so the
              record values Review shows are the current ones — beside this run&rsquo;s older scores, they would
              ask you to certify a pair against data the score was never computed from.{' '}
              <Link
                href={`/matching/${projectId}/runs/${latestCompletedRun.id}`}
                className="text-[#1a1a1a] underline"
              >
                Open the latest completed run
              </Link>{' '}
              to review. Everything else on this page is this run&rsquo;s own record and is unaffected.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
            <StatCard name="Rows" subtitle="Materialized from source" value={run.counters.leftRows.toLocaleString()} icon={Database} iconColor="blue" />
            <StatCard
              name="Candidate pairs"
              subtitle="Scored by this run"
              value={run.counters.candidatePairs.toLocaleString()}
              icon={Users}
              iconColor="gray"
            />
            <StatCard name="Auto-matched" subtitle="Score at or above match threshold" value={run.counters.autoMatch.toLocaleString()} icon={CheckCircle2} iconColor="green" />
            <StatCard name="Grey band" subtitle="Awaiting human review" value={run.counters.grey.toLocaleString()} icon={ClipboardList} iconColor="orange" />
            {/*
              Ruling R51: this counter is NOT "rejected". `MatchRunCounters.autoReject`,
              `ScoreResult.autoReject` and `MatchRunService.scoreOnePass` each say so
              explicitly, and each requires the definition to travel with the number:
              it is candidate pairs SEEN minus rows NEWLY INSERTED, summed over the
              run's passes. Because the scoring insert is `ON CONFLICT DO NOTHING`, a
              pair an earlier blocking pass already stored is counted by a later pass's
              total and skipped by its insert, so it lands here alongside the genuinely
              low-scoring pairs. Separating the two would need a third statement per
              pass over hundreds of millions of rows, which Ruling P9 forbids. The
              caveat below the grid is part of the label, not decoration.
            */}
            <StatCard
              name="Pairs not stored"
              subtitle="Seen minus newly stored"
              value={run.counters.autoReject.toLocaleString()}
              icon={ThumbsDown}
              iconColor="gray"
            />
            <StatCard name="Clusters" subtitle="Entities resolved" value={run.counters.clusters.toLocaleString()} icon={Layers} iconColor="blue" />
            <StatCard name="Flagged" subtitle="Held back from the Crosswalk" value={run.counters.flaggedClusters.toLocaleString()} icon={Flag} iconColor="red" />
          </div>

          {/* Ruling R51: the definition travels with the number, per all three source comments. */}
          <p className="text-xs text-[#aaaaaa] mb-2">
            &ldquo;Pairs not stored&rdquo; counts candidate pairs this run saw minus rows it newly stored. Most
            of them scored below the reject threshold, but a pair an earlier blocking pass already stored is
            counted here too, so it is not a count of rejections. It also does not partition the candidate
            pairs: a pair carrying a human verdict is stored as confirmed or rejected and appears in neither
            &ldquo;Auto-matched&rdquo; nor &ldquo;Grey band&rdquo;, so those three will not add up to
            &ldquo;Candidate pairs&rdquo; once anyone has reviewed anything.
          </p>

          {/*
            Ruling R20: a trigram blocking pass's pair projection is a
            declared lower bound, never an estimate -- estimatedPairs must
            render as "at least N", never a bare number, whenever
            hasInexactPass is true. candidatePairs above is a real
            post-blocking count and is exempt from this rule; this is the
            pre-run projection specifically.
          */}
          <p className="text-xs text-[#aaaaaa] mb-6">
            Before this run started, blocking projected{' '}
            {run.counters.hasInexactPass ? (
              <>at least {run.counters.estimatedPairs.toLocaleString()} pairs (a trigram pass&rsquo;s projection is a lower bound, not a count)</>
            ) : (
              <>{run.counters.estimatedPairs.toLocaleString()} pairs</>
            )}
            .
          </p>

          <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-[#1a1a1a] mb-1">Cluster size distribution</h2>
            {sampleTruncated && (
              <p className="text-xs text-[#aaaaaa] mb-3">
                Based on the first {clusters!.length.toLocaleString()} of {run.counters.clusters.toLocaleString()}{' '}
                clusters — open the Clusters page for the complete set.
              </p>
            )}
            {!clusters && !clustersError && <p className="text-sm text-[#aaaaaa]">Loading…</p>}
            {clustersError && <p className="text-sm text-red-700">Failed to load clusters: {clustersError.message}</p>}
            {clusters && clusters.length === 0 && <p className="text-sm text-[#aaaaaa]">No clusters yet.</p>}
            {histogram.length > 0 && (
              <div className="space-y-2">
                {histogram.map((row) => (
                  <div key={row.bucket} className="flex items-center gap-3">
                    <div className="w-16 text-xs text-[#555555] text-right flex-shrink-0">{row.bucket} members</div>
                    <div className="flex-1 h-4 rounded bg-[#f0f0f0] overflow-hidden">
                      <div className="h-full rounded bg-[#60a5fa]" style={{ width: `${row.pct}%` }} />
                    </div>
                    <div className="w-10 text-xs text-[#555555] tabular-nums">{row.count.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
            <div className="px-5 py-4 border-b border-[#e8e8e8]">
              <h2 className="text-sm font-semibold text-[#1a1a1a]">Flagged clusters</h2>
              <p className="text-xs text-[#aaaaaa] mt-1">
                A flagged cluster is held back from the Crosswalk until its internal pairs are reviewed and this
                project is run again — publishing it now would put a merge into the Crosswalk that the over-merge
                guard specifically withheld.
              </p>
            </div>

            {flaggedClusters.length === 0 && clusters && (
              <div className="p-6 text-sm text-[#aaaaaa]">No flagged clusters in this run.</div>
            )}

            {flaggedClusters.length > 0 && (
              <div className="divide-y divide-[#eeeeee]">
                {flaggedClusters.map((cluster) => (
                  <div key={cluster.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                      <span className="text-sm text-[#1a1a1a] font-medium">{cluster.entityKey}</span>
                    </div>
                    <span className="text-xs text-[#555555]">{cluster.size} members</span>
                  </div>
                ))}
              </div>
            )}

            {flaggedTruncated && (
              <div className="px-5 py-3 border-t border-[#eeeeee] text-xs text-[#aaaaaa]">
                {run.counters.flaggedClusters.toLocaleString()} clusters are flagged in this run; only the first{' '}
                {flaggedClusters.length.toLocaleString()} are shown here — open the Clusters page for the rest.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
