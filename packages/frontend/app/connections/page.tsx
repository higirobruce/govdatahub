'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Connection, CreateConnectionDto } from '@/types';
import ConnectionForm from '@/components/ConnectionManager/ConnectionForm';
import ConnectionList from '@/components/ConnectionManager/ConnectionList';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

export default function ConnectionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const { data: connections, error } = useSWR<Connection[]>(
    '/connections',
    () => api.connections.list()
  );

  const handleCreate = async (data: CreateConnectionDto) => {
    try {
      await api.connections.create(data);
      mutate('/connections');
      setShowForm(false);
      setNotification({
        type: 'success',
        message: 'Connection created successfully!',
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      setNotification({
        type: 'error',
        message: error.message || 'Failed to create connection',
      });
      setTimeout(() => setNotification(null), 5000);
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this connection?')) {
      return;
    }

    try {
      await api.connections.delete(id);
      mutate('/connections');
      setNotification({
        type: 'success',
        message: 'Connection deleted successfully!',
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      setNotification({
        type: 'error',
        message: error.message || 'Failed to delete connection',
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await api.connections.test(id);
      setNotification({
        type: result.success ? 'success' : 'error',
        message: result.message,
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      setNotification({
        type: 'error',
        message: error.message || 'Failed to test connection',
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Connections"
        subtitle="Manage your database connections"
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

      {/* Notification */}
      {notification && (
        <div
          className={`rounded-md p-4 border ${
            notification.type === 'success'
              ? 'bg-[#d1fae5] text-[#065f46] border-[#86efac]'
              : 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]'
          }`}
        >
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

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
    </div>
  );
}
