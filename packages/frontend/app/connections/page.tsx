'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { Connection, CreateConnectionDto } from '@/types';
import ConnectionForm from '@/components/ConnectionManager/ConnectionForm';
import ConnectionList from '@/components/ConnectionManager/ConnectionList';

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Connections</h1>
          <p className="mt-2 text-gray-600">
            Manage your database connections
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          {showForm ? 'Cancel' : 'Add Connection'}
        </button>
      </div>

      {/* Notification */}
      {notification && (
        <div
          className={`rounded-md p-4 ${
            notification.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      {/* Connection Form */}
      {showForm && (
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              New Database Connection
            </h3>
            <ConnectionForm onSubmit={handleCreate} />
          </div>
        </div>
      )}

      {/* Connection List */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Your Connections
          </h3>
          {error && (
            <div className="text-red-600 text-sm mb-4">
              Failed to load connections: {error.message}
            </div>
          )}
          {!connections && !error && (
            <div className="text-gray-500 text-sm">Loading connections...</div>
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
