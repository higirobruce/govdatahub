'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { SavedCrossQuery, QueryDefinition } from '@/types';

interface SavedQueriesPanelProps {
  onLoadQuery: (queryDefinition: QueryDefinition) => void;
  currentQuery: QueryDefinition;
}

export function SavedQueriesPanel({
  onLoadQuery,
  currentQuery,
}: SavedQueriesPanelProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: savedQueries, error } = useSWR<SavedCrossQuery[]>(
    '/cross-query/saved',
    async () => {
      const result = await api.crossQuery.listSaved();
      return result as SavedCrossQuery[];
    }
  );

  const handleSaveQuery = async () => {
    if (!saveName.trim()) {
      alert('Please enter a name for the query');
      return;
    }

    if (currentQuery.tables.length === 0) {
      alert('Cannot save an empty query');
      return;
    }

    setIsSaving(true);

    try {
      await api.crossQuery.saveQuery({
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        queryDefinition: currentQuery,
      });

      // Refresh saved queries list
      mutate('/cross-query/saved');

      // Reset form
      setSaveName('');
      setSaveDescription('');
      setShowSaveDialog(false);

      alert('Query saved successfully!');
    } catch (err: any) {
      alert(`Failed to save query: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadQuery = (savedQuery: SavedCrossQuery) => {
    if (confirm(`Load query "${savedQuery.name}"? This will replace your current query.`)) {
      onLoadQuery(savedQuery.queryDefinition);
    }
  };

  const handleDeleteQuery = async (id: string, name: string) => {
    if (!confirm(`Delete query "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.crossQuery.deleteSaved(id);
      mutate('/cross-query/saved');
      alert('Query deleted successfully');
    } catch (err: any) {
      alert(`Failed to delete query: ${err.message}`);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-3">
      {/* Save Current Query Button */}
      <button
        onClick={() => setShowSaveDialog(true)}
        className="w-full px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
        disabled={currentQuery.tables.length === 0}
      >
        💾 Save Current Query
      </button>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Save Query
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="My Cross-Database Query"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Describe what this query does..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveName('');
                  setSaveDescription('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuery}
                disabled={isSaving || !saveName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Query'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Queries List */}
      <div className="border-t pt-3">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">
          Saved Queries
        </h4>

        {error && (
          <div className="text-sm text-red-600">
            Failed to load saved queries
          </div>
        )}

        {!savedQueries && !error && (
          <div className="text-sm text-gray-500">
            Loading saved queries...
          </div>
        )}

        {savedQueries && savedQueries.length === 0 && (
          <div className="text-sm text-gray-500">
            No saved queries yet. Save your first query above!
          </div>
        )}

        {savedQueries && savedQueries.length > 0 && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {savedQueries.map((query) => (
              <div
                key={query.id}
                className="p-3 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {query.name}
                    </div>
                    {query.description && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {query.description}
                      </p>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDate(query.createdAt)}
                    </div>
                    <div className="flex gap-1 mt-2 text-xs text-gray-600">
                      <span>{query.queryDefinition.tables.length} tables</span>
                      <span>•</span>
                      <span>{query.queryDefinition.joins.length} joins</span>
                      <span>•</span>
                      <span>{query.queryDefinition.columns.length} columns</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleLoadQuery(query)}
                    className="flex-1 px-3 py-1 text-xs font-medium text-indigo-600 border border-indigo-300 rounded hover:bg-indigo-50"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDeleteQuery(query.id, query.name)}
                    className="flex-1 px-3 py-1 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
