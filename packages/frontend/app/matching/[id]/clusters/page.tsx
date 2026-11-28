'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import type { MatchClusterDto } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Flag, Layers } from 'lucide-react';

const PAGE_SIZE = 24;
const MEMBER_PREVIEW = 12;

export default function ClustersPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  // Relies on this page rendering dynamically -- see app/query/page.tsx's
  // identical note on useSearchParams() and Next's static-prerender rules.
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId');

  const [offset, setOffset] = useState(0);

  const { data: clusters, error } = useSWR<MatchClusterDto[]>(
    runId ? `/matching/runs/${runId}/clusters?limit=${PAGE_SIZE}&offset=${offset}` : null,
    () => api.matching.listClusters(runId!, PAGE_SIZE, offset),
  );

  if (!runId) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-8 text-center">
          <p className="text-sm text-[#1a1a1a] font-medium mb-1">No run selected</p>
          <p className="text-sm text-[#aaaaaa] mb-4">
            Open the project page and choose Clusters from a completed run.
          </p>
          <Button asChild>
            <Link href={`/matching/${projectId}`}>Back to project</Link>
          </Button>
        </div>
      </div>
    );
  }

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

      <PageHeader title="Clusters" subtitle="Flagged clusters first, then largest first" icon={Layers} />

      {error && <div className="p-6 text-sm text-red-700">Failed to load clusters: {error.message}</div>}
      {!clusters && !error && <div className="p-6 text-sm text-[#aaaaaa]">Loading…</div>}

      {clusters && clusters.length === 0 && (
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-8 text-center">
          <p className="text-sm text-[#1a1a1a] font-medium">No clusters here</p>
          <p className="text-sm text-[#aaaaaa] mt-1">
            {offset === 0 ? 'This run produced no clusters.' : "You've reached the end of the list."}
          </p>
        </div>
      )}

      {clusters && clusters.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map((cluster) => (
            <div
              key={cluster.id}
              className={`bg-white rounded-xl border shadow-card p-4 ${
                cluster.flagged ? 'border-amber-300' : 'border-[#e8e8e8]'
              }`}
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <span className="font-mono text-sm text-[#1a1a1a] break-all" title={cluster.entityKey}>
                  {cluster.entityKey}
                </span>
                {cluster.flagged && (
                  <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 gap-1 flex-shrink-0">
                    <Flag className="h-3 w-3" />
                    Flagged
                  </Badge>
                )}
              </div>
              <div className="text-xs text-[#aaaaaa] mb-3">{cluster.size.toLocaleString()} members</div>

              {cluster.flagged && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-3">
                  Held back from the Crosswalk until its internal pairs are reviewed and this project runs again.
                </p>
              )}

              <ul className="text-xs text-[#555555] space-y-0.5">
                {cluster.members.slice(0, MEMBER_PREVIEW).map((member, idx) => (
                  <li key={idx} className="truncate font-mono" title={member.sourceKey}>
                    {member.sourceKey}
                  </li>
                ))}
              </ul>
              {cluster.members.length > MEMBER_PREVIEW && (
                <div className="text-xs text-[#aaaaaa] mt-1">
                  and {(cluster.members.length - MEMBER_PREVIEW).toLocaleString()} more
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {clusters && (offset > 0 || clusters.length === PAGE_SIZE) && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={offset === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-[#555555]">Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={clusters.length < PAGE_SIZE}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
