'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Notebook } from '@/types/notebook';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BookOpen, Plus, Trash2, Clock, ChevronRight } from 'lucide-react';

export default function NotebooksPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Notebook | null>(null);

  const { data: notebooks, mutate } = useSWR<Notebook[]>(
    '/notebooks',
    () => api.notebooks.list() as Promise<Notebook[]>,
  );

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const notebook = await api.notebooks.create({ name: 'Untitled Notebook' });
      await mutate();
      router.push(`/notebooks/${notebook.id}`);
    } catch {
      showToast('Failed to create notebook', 'error');
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.notebooks.delete(deleteTarget.id);
      showToast('Notebook deleted', 'success');
      await mutate();
    } catch {
      showToast('Failed to delete notebook', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="w-full h-screen flex flex-col bg-[#f2f2f2] overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-6 pb-0">
        <PageHeader
          title="Notebooks"
          subtitle="Write and execute SQL queries in a Jupyter-like notebook environment"
          icon={BookOpen}
          iconGradient="from-violet-500 to-indigo-600"
          actions={
            <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
              <Plus className="w-4 h-4" />
              New Notebook
            </Button>
          }
          className="mb-4"
        />
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {!notebooks ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-sm text-[#aaaaaa]">Loading notebooks…</div>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-4">
            <BookOpen className="w-12 h-12 text-[#cccccc]" />
            <div className="text-center">
              <p className="text-sm font-medium text-[#555555]">No notebooks yet</p>
              <p className="text-xs text-[#aaaaaa] mt-1">Create a notebook to start writing SQL queries with inline results</p>
            </div>
            <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
              <Plus className="w-4 h-4" />
              New Notebook
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {notebooks.map((nb) => (
              <div
                key={nb.id}
                className="bg-white rounded-xl border border-[#e8e8e8] shadow-sm hover:shadow-md transition-shadow group"
              >
                <Link href={`/notebooks/${nb.id}`} className="block p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[#1a1a1a] truncate group-hover:text-violet-600 transition-colors">
                        {nb.name}
                      </h3>
                      {nb.description && (
                        <p className="text-xs text-[#777777] mt-0.5 line-clamp-2">{nb.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#aaaaaa]">
                    <Clock className="w-3 h-3" />
                    Updated {formatDate(nb.updatedAt)}
                  </div>
                </Link>
                <div className="px-5 pb-4 flex items-center justify-between border-t border-[#f5f5f5] pt-3">
                  <Link
                    href={`/notebooks/${nb.id}`}
                    className="flex items-center gap-1 text-xs text-violet-600 font-medium hover:text-violet-700"
                  >
                    Open <ChevronRight className="w-3 h-3" />
                  </Link>
                  <button
                    onClick={(e) => { e.preventDefault(); setDeleteTarget(nb); }}
                    className="p-1 text-[#aaaaaa] hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="Delete notebook"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Notebook"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
