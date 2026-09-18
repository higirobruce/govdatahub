'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { MatchProjectDto, MatchRunDto } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Check, Clock, Pencil, Plus, Trash2, Users, X } from 'lucide-react';

const MODE_LABELS: Record<string, string> = { dedupe: 'Dedupe', link: 'Link' };

const RUN_STATUS_STYLES: Record<string, string> = {
  completed: 'text-green-700',
  failed: 'text-red-700',
  pending: 'text-[#aaaaaa]',
  materializing: 'text-amber-700',
  normalizing: 'text-amber-700',
  blocking: 'text-amber-700',
  scoring: 'text-amber-700',
  clustering: 'text-amber-700',
};

/**
 * Fetches this one project's runs to show the most recent status. There is
 * no per-project "last run" field on MatchProjectDto (runs are a separate,
 * project-scoped list — see MatchRunDto), so this is a small per-row
 * request rather than something the list endpoint can return in one call.
 */
function LastRunStatus({ projectId }: { projectId: string }) {
  const { data: runs } = useSWR<MatchRunDto[]>(`/matching/projects/${projectId}/runs`, () =>
    api.matching.listRuns(projectId),
  );

  if (!runs) {
    return <span className="text-xs text-[#aaaaaa]">…</span>;
  }
  if (runs.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#aaaaaa]">
        <Clock className="h-3 w-3" /> Never run
      </span>
    );
  }
  // The backend orders runs by startedAt DESC, so the first row is the latest.
  const latest = runs[0];
  return (
    <span className={`text-xs font-medium ${RUN_STATUS_STYLES[latest.status] ?? 'text-[#555555]'}`}>
      {latest.status}
    </span>
  );
}

export default function MatchingPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const { data: projects, error } = useSWR<MatchProjectDto[]>('/matching/projects', () =>
    api.matching.listProjects(),
  );

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ isOpen: boolean; id: string | null; name: string }>({
    isOpen: false,
    id: null,
    name: '',
  });

  function startRename(project: MatchProjectDto) {
    setRenameId(project.id);
    setRenameValue(project.name);
  }

  function cancelRename() {
    setRenameId(null);
    setRenameValue('');
  }

  async function saveRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      showToast('Name cannot be empty', 'error');
      return;
    }
    setSavingRename(true);
    try {
      await api.matching.updateProject(id, { name: trimmed });
      await mutate('/matching/projects');
      showToast('Project renamed', 'success');
      setRenameId(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to rename project', 'error');
    } finally {
      setSavingRename(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget.id) return;
    try {
      await api.matching.deleteProject(deleteTarget.id);
      await mutate('/matching/projects');
      showToast('Match project removed from your list', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete project', 'error');
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Entity Matching"
        subtitle="Find and resolve records that describe the same real-world entity"
        icon={Users}
        actions={
          <Button onClick={() => router.push('/matching/new')} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New project
          </Button>
        }
      />

      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
        {error && (
          <div className="p-6 text-sm text-red-700">
            Failed to load match projects: {error.message}
          </div>
        )}
        {!projects && !error && <div className="p-6 text-sm text-[#aaaaaa]">Loading…</div>}

        {projects && projects.length === 0 && (
          <EmptyState
            icon={Users}
            title="No match projects yet"
            description="A Match Project is the saved configuration for one matching problem — which data to compare, which fields to compare, how strictly, and under what authority. Create one to start finding duplicate records in a registry."
            action={{ label: 'New project', onClick: () => router.push('/matching/new') }}
          />
        )}

        {projects && projects.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    {renameId === project.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(project.id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                          disabled={savingRename}
                          className="rounded-md border border-[#dddddd] px-2 py-1 text-sm focus:border-[#1a1a1a] outline-none"
                        />
                        <button
                          onClick={() => saveRename(project.id)}
                          disabled={savingRename}
                          className="text-green-600 hover:text-green-700"
                          title="Save"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={cancelRename}
                          disabled={savingRename}
                          className="text-[#aaaaaa] hover:text-[#1a1a1a]"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span className="font-medium text-[#1a1a1a]">{project.name}</span>
                        <button
                          onClick={() => startRename(project)}
                          className="opacity-0 group-hover:opacity-100 text-[#aaaaaa] hover:text-[#1a1a1a] transition-opacity"
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {project.description && (
                      <div className="text-xs text-[#aaaaaa] mt-0.5">{project.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#f5f5f5] text-[#555555] font-medium">
                      {MODE_LABELS[project.mode] ?? project.mode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <LastRunStatus projectId={project.id} />
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() =>
                        setDeleteTarget({ isOpen: true, id: project.id, name: project.name })
                      }
                      className="p-1.5 rounded text-[#aaaaaa] hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteTarget.isOpen}
        onClose={() => setDeleteTarget({ isOpen: false, id: null, name: '' })}
        onConfirm={confirmDelete}
        title="Delete match project"
        message={
          <>
            Remove <strong>{deleteTarget.name}</strong> from your project list? Its records, decisions
            and audit history are retained — this removes it from view but does not erase that history.
          </>
        }
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
