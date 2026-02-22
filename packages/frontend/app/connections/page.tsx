'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Connection, CreateConnectionDto } from '@/types';
import ConnectionForm from '@/components/ConnectionManager/ConnectionForm';
import ConnectionList from '@/components/ConnectionManager/ConnectionList';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Plus, X, Database } from 'lucide-react';

export default function ConnectionsPage() {
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({
    isOpen: false,
    id: null,
  });

  const { data: connections, error } = useSWR<Connection[]>(
    '/connections',
    () => api.connections.list()
  );

  const handleCreate = async (data: CreateConnectionDto) => {
    try {
      await api.connections.create(data);
      mutate('/connections');
      setShowForm(false);
      showToast('Connection created successfully!', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to create connection', 'error');
      throw error;
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;

    try {
      await api.connections.delete(deleteConfirm.id);
      mutate('/connections');
      showToast('Connection deleted successfully!', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to delete connection', 'error');
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await api.connections.test(id);
      showToast(result.message, result.success ? 'success' : 'error');
    } catch (error: any) {
      showToast(error.message || 'Failed to test connection', 'error');
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Connections"
        subtitle="Manage your database connections"
        icon={Database}
        actions={
          <Button onClick={() => setShowForm(!showForm)} variant={showForm ? 'outline' : 'default'}>
            {showForm ? (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Add Connection
              </>
            )}
          </Button>
        }
      />

      {/* Connection Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
          <div className="px-6 py-5">
            <h3 className="text-base font-semibold text-[#1a1a1a] mb-4">
              New Database Connection
            </h3>
            <ConnectionForm onSubmit={handleCreate} />
          </div>
        </div>
      )}

      {/* Connection List */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
        <div className="px-6 py-5">
          <h3 className="text-base font-semibold text-[#1a1a1a] mb-4">
            Your Connections
          </h3>
          {error && (
            <div className="text-[#ef4444] text-sm mb-4 bg-[#fee2e2] border border-[#fca5a5] rounded p-3">
              Failed to load connections: {error.message}
            </div>
          )}
          {!connections && !error && (
            <div className="text-[#aaaaaa] text-sm">Loading connections...</div>
          )}
          {connections && (
            <ConnectionList
              connections={connections}
              onDelete={handleDelete}
              onTest={handleTest}
            />
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
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
