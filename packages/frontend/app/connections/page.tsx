'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Connection, CreateConnectionDto } from '@/types';
import ConnectionForm from '@/components/ConnectionManager/ConnectionForm';
import ConnectionList from '@/components/ConnectionManager/ConnectionList';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, Database } from 'lucide-react';

export default function ConnectionsPage() {
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  const { data: connections, error } = useSWR<Connection[]>(
    '/connections',
    async () => {
      const result = await api.connections.list();
      return result as Connection[];
    }
  );

  const handleCreate = async (data: CreateConnectionDto) => {
    await api.connections.create(data);
    mutate('/connections');
    setSheetOpen(false);
    showToast('Connection created successfully!', 'success');
  };

  const handleDelete = async (id: string): Promise<void> => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      await api.connections.delete(deleteConfirm.id);
      mutate('/connections');
      showToast('Connection deleted.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete connection', 'error');
    }
  };

  const handleTest = async (id: string): Promise<void> => {
    try {
      const result = await api.connections.test(id) as { success: boolean; message: string };
      showToast(result.message, result.success ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message || 'Failed to test connection', 'error');
    }
  };

  const count = connections?.length ?? 0;

  return (
    <div className="w-full">
      <PageHeader
        title="Connections"
        subtitle={count > 0 ? `${count} database connection${count !== 1 ? 's' : ''}` : 'Manage your database connections'}
        icon={Database}
        actions={
          <Button onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Connection
          </Button>
        }
      />

      {/* Error state */}
      {error && (
        <div className="mb-4 text-sm text-[#ef4444] bg-[#fee2e2] border border-[#fca5a5] rounded-xl px-4 py-3">
          Failed to load connections: {error.message}
        </div>
      )}

      {/* Loading skeleton */}
      {!connections && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-2xl border border-[#eeeeee] bg-[#f9f9f9] animate-pulse" />
          ))}
        </div>
      )}

      {/* Connection cards */}
      {connections && (
        <ConnectionList
          connections={connections}
          onDelete={handleDelete}
          onTest={handleTest}
        />
      )}

      {/* New connection drawer */}
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="New Connection"
        description="Connect a database to start querying, transforming, and exploring your data."
      >
        <ConnectionForm
          onSubmit={handleCreate}
          onCancel={() => setSheetOpen(false)}
        />
      </Sheet>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null })}
        onConfirm={confirmDelete}
        title="Delete Connection"
        message="Are you sure you want to delete this connection? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
