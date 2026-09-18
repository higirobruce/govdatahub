'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import type { MatchProjectDto, MatchRunDto, MatchRunStatus } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, ArrowLeft, ClipboardList, Clock, Layers, Play, Users } from 'lucide-react';

const MODE_LABELS: Record<string, string> = { dedupe: 'Dedupe', link: 'Link' };

const RUN_STATUS_STYLES: Record<MatchRunStatus, string> = {
  completed: 'text-green-700 bg-green-50',
  failed: 'text-red-700 bg-red-50',
  pending: 'text-[#777777] bg-[#f0f0f0]',
  materializing: 'text-amber-700 bg-amber-50',
  normalizing: 'text-amber-700 bg-amber-50',
  blocking: 'text-amber-700 bg-amber-50',
  scoring: 'text-amber-700 bg-amber-50',
  clustering: 'text-amber-700 bg-amber-50',
};

/** A run is still in flight -- neither settled as completed nor failed. */
const ACTIVE_STATUSES: MatchRunStatus[] = [
  'pending',
  'materializing',
  'normalizing',
  'blocking',
  'scoring',
  'clustering',
];

/**
 * Ruling R54: how long a run must have sat in a non-terminal status
 * before this page calls it stranded and offers a way out. Matches
 * `ABANDON_AFTER_MS` in `match-run.service.ts`, which is the authority --
 * the server refuses an earlier abandon, so a shorter value here would
 * only offer a button that 409s.
 */
const STRANDED_AFTER_MS = 15 * 60 * 1000;

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

export default function MatchProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  const { data: project, error: projectError } = useSWR<MatchProjectDto>(
    `/matching/projects/${projectId}`,
    () => api.matching.getProject(projectId),
  );
  const { data: runs, error: runsError } = useSWR<MatchRunDto[]>(
    `/matching/projects/${projectId}/runs`,
    () => api.matching.listRuns(projectId),
  );

  // Runs are ordered startedAt DESC by the backend, so the first match of
  // each kind is the most recent one of that kind.
  const latestCompletedRun = runs?.find((r) => r.status === 'completed') ?? null;
  const activeRun = runs?.find((r) => ACTIVE_STATUSES.includes(r.status)) ?? null;
  const hasActiveRun = !!activeRun;
  /*
    Ruling R54: a run whose process died between statuses -- a restart
    mid-stage, a dropped connection before the terminal write -- leaves its
    row at `scoring` forever. `hasActiveRun` then reads it as "a run is in
    progress" and disables Run now permanently, and nothing in the product
    could clear it: the only writer of a terminal status was the pipeline
    that already died. After the same threshold the server uses, the run is
    surfaced with an explanation and a way out rather than being left as a
    silent dead end.
  */
  const strandedRun =
    activeRun && Date.now() - new Date(activeRun.startedAt).getTime() > STRANDED_AFTER_MS ? activeRun : null;

  async function abandonStranded() {
    if (!strandedRun) return;
    setAbandoning(true);
    try {
      await api.matching.abandonRun(strandedRun.id);
      await mutate(`/matching/projects/${projectId}/runs`);
      showToast('Stranded run recorded as failed — you can run this project again', 'success');
    } catch (err: any) {
      // The server refuses unless the project's advisory lock is free, so
      // a 409 here means the run really is still executing. Surfacing that
      // message verbatim is the point -- it is the only thing that
      // distinguishes "stuck" from "slow".
      showToast(err.message || 'Failed to abandon the run', 'error');
    } finally {
      setAbandoning(false);
    }
  }

  async function runNow() {
    setStarting(true);
    try {
      await api.matching.startRun(projectId);
      await mutate(`/matching/projects/${projectId}/runs`);
      showToast('Run started', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to start run', 'error');
    } finally {
      setStarting(false);
    }
  }

  if (projectError) {
    return (
      <div className="w-full">
        <div className="p-6 text-sm text-red-700">Failed to load project: {projectError.message}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3">
        <Link
          href="/matching"
          className="inline-flex items-center gap-1.5 text-sm text-[#777777] hover:text-[#1a1a1a] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Entity Matching
        </Link>
      </div>

      <PageHeader
        title={project?.name ?? 'Loading…'}
        subtitle={project?.description || 'Match project detail'}
        icon={Users}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!latestCompletedRun}
              onClick={() =>
                latestCompletedRun && router.push(`/matching/${projectId}/review?runId=${latestCompletedRun.id}`)
              }
              className="gap-1.5"
            >
              <ClipboardList className="h-4 w-4" />
              Review queue
            </Button>
            <Button
              variant="outline"
              disabled={!latestCompletedRun}
              onClick={() =>
                latestCompletedRun && router.push(`/matching/${projectId}/clusters?runId=${latestCompletedRun.id}`)
              }
              className="gap-1.5"
            >
              <Layers className="h-4 w-4" />
              Clusters
            </Button>
            <Button onClick={runNow} disabled={starting || hasActiveRun || !project} className="gap-1.5">
              <Play className="h-4 w-4" />
              {hasActiveRun ? 'Run in progress…' : starting ? 'Starting…' : 'Run now'}
            </Button>
          </>
        }
      />

      {strandedRun && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[#1a1a1a]">
                A run has been stuck at &ldquo;{strandedRun.status}&rdquo; since{' '}
                {formatDateTime(strandedRun.startedAt)}
              </p>
              <p className="text-xs text-[#555555] mt-1">
                While a run is in a non-terminal status this project cannot start another one. A run that
                stops reporting — its process restarted mid-stage, or its database connection dropped before
                it could record the outcome — never reaches one on its own. Abandoning records it as failed
                so the project can run again; it is refused if the run turns out to still be executing, so
                it is safe to try.{' '}
                <Link href={`/matching/${projectId}/runs/${strandedRun.id}`} className="text-[#1a1a1a] underline">
                  Open the run
                </Link>{' '}
                first if you want to see how far it got.
              </p>
              <Button
                variant="outline"
                className="mt-3 h-8 text-xs"
                onClick={abandonStranded}
                disabled={abandoning}
              >
                {abandoning ? 'Abandoning…' : 'Abandon this run'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {project && (
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-5 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[11px] font-semibold text-[#aaaaaa] uppercase tracking-wide mb-0.5">Mode</div>
              <div className="text-[#1a1a1a]">{MODE_LABELS[project.mode] ?? project.mode}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#aaaaaa] uppercase tracking-wide mb-0.5">
                Lawful basis
              </div>
              <div className="text-[#1a1a1a]">{project.lawfulBasis}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#aaaaaa] uppercase tracking-wide mb-0.5">
                Data owner
              </div>
              <div className="text-[#1a1a1a]">{project.dataOwner}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#aaaaaa] uppercase tracking-wide mb-0.5">
                Retention
              </div>
              <div className="text-[#1a1a1a]">{project.retentionDays} days</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
        <div className="px-5 py-4 border-b border-[#e8e8e8]">
          <h2 className="text-sm font-semibold text-[#1a1a1a]">Run history</h2>
        </div>

        {runsError && (
          <div className="p-6 text-sm text-red-700">Failed to load runs: {runsError.message}</div>
        )}
        {!runs && !runsError && <div className="p-6 text-sm text-[#aaaaaa]">Loading…</div>}

        {runs && runs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-[#f8f8f8] p-3 mb-4">
              <Clock className="h-6 w-6 text-[#aaaaaa]" />
            </div>
            <h3 className="text-sm font-medium text-[#1a1a1a] mb-1">No runs yet</h3>
            <p className="text-sm text-[#aaaaaa] max-w-sm mb-4">
              Run this project to materialize its source, block, score and cluster candidate pairs.
            </p>
            <Button onClick={runNow} disabled={starting || !project} className="gap-1.5">
              <Play className="h-4 w-4" />
              Run now
            </Button>
          </div>
        )}

        {runs && runs.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Candidate pairs</TableHead>
                <TableHead>Clusters</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow
                  key={run.id}
                  className="cursor-pointer hover:bg-[#fafafa]"
                  onClick={() => router.push(`/matching/${projectId}/runs/${run.id}`)}
                >
                  <TableCell>
                    <Link href={`/matching/${projectId}/runs/${run.id}`} className="text-[#1a1a1a] hover:underline">
                      {formatDateTime(run.startedAt)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${RUN_STATUS_STYLES[run.status] ?? 'text-[#555555] bg-[#f5f5f5]'}`}
                    >
                      {run.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-[#555555]">{formatDuration(run.durationMs)}</TableCell>
                  {/* candidatePairs is a real post-blocking count, not the pre-run
                      estimate -- Ruling R20's "at least N" phrasing binds
                      counters.estimatedPairs, not this field, so it renders as a
                      plain number regardless of hasInexactPass. */}
                  <TableCell className="text-[#555555]">{run.counters.candidatePairs.toLocaleString()}</TableCell>
                  <TableCell className="text-[#555555]">{run.counters.clusters.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
