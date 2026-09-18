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
              <Button asChild variant="outline" className="gap-1.5">
                <Link href={`/matching/${projectId}/review?runId=${run.id}`}>
                  <ClipboardList className="h-4 w-4" />
                  Review queue
                </Link>
              </Button>
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
            <StatCard name="Rejected" subtitle="Score below reject threshold" value={run.counters.autoReject.toLocaleString()} icon={ThumbsDown} iconColor="red" />
            <StatCard name="Clusters" subtitle="Entities resolved" value={run.counters.clusters.toLocaleString()} icon={Layers} iconColor="blue" />
            <StatCard name="Flagged" subtitle="Held back from the Crosswalk" value={run.counters.flaggedClusters.toLocaleString()} icon={Flag} iconColor="red" />
          </div>

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
