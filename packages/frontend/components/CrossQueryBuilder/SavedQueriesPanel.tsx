'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { api } from '@/lib/api';
import { SavedCrossQuery, QueryDefinition } from '@/types';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Share2 } from 'lucide-react';

interface SavedQueriesPanelProps {
  onLoadQuery: (queryDefinition: QueryDefinition) => void;
  currentQuery: QueryDefinition;
}

export function SavedQueriesPanel({
  onLoadQuery,
  currentQuery,
}: SavedQueriesPanelProps) {
  const { showToast } = useToast();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedQueryForShare, setSelectedQueryForShare] = useState<SavedCrossQuery | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareForm, setShareForm] = useState({
    name: '',
    description: '',
    accessLevel: 'private' as 'private' | 'organization' | 'public',
    generateApiKey: false,
    generateShareToken: false,
  });
  const [loadConfirm, setLoadConfirm] = useState<{ isOpen: boolean; query: SavedCrossQuery | null }>({
    isOpen: false,
    query: null,
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null; name: string | null }>({
    isOpen: false,
    id: null,
    name: null,
  });

  const { data: savedQueries, error } = useSWR<SavedCrossQuery[]>(
    '/cross-query/saved',
    async () => {
      const result = await api.crossQuery.listSaved();
      return result as SavedCrossQuery[];
    }
  );

  const handleSaveQuery = async () => {
    if (!saveName.trim()) {
      showToast('Please enter a name for the query', 'warning');
      return;
    }

    if (currentQuery.tables.length === 0) {
      showToast('Cannot save an empty query', 'warning');
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

      showToast('Query saved successfully!', 'success');
    } catch (err: any) {
      showToast(`Failed to save query: ${err.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadQuery = (savedQuery: SavedCrossQuery) => {
    setLoadConfirm({ isOpen: true, query: savedQuery });
  };

  const confirmLoad = () => {
    if (loadConfirm.query) {
      onLoadQuery(loadConfirm.query.queryDefinition);
      showToast(`Loaded query "${loadConfirm.query.name}"`, 'success');
    }
  };

  const handleDeleteQuery = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;

    try {
      await api.crossQuery.deleteSaved(deleteConfirm.id);
      mutate('/cross-query/saved');
      showToast('Query deleted successfully', 'success');
    } catch (err: any) {
      showToast(`Failed to delete query: ${err.message}`, 'error');
    }
  };

  const handleShareQuery = (query: SavedCrossQuery) => {
    setSelectedQueryForShare(query);
    setShareForm({
      name: query.name,
      description: query.description || '',
      accessLevel: 'private',
      generateApiKey: false,
      generateShareToken: false,
    });
    setShowShareDialog(true);
  };

  const handleSubmitShare = async () => {
    if (!selectedQueryForShare) return;

    setIsSharing(true);
    try {
      await api.dashboard.createShare({
        name: shareForm.name,
        description: shareForm.description,
        datasetType: 'cross-query',
        datasetId: selectedQueryForShare.id,
        accessLevel: shareForm.accessLevel,
        generateApiKey: shareForm.generateApiKey,
        generateShareToken: shareForm.generateShareToken,
      });
      showToast('Cross-query shared successfully!', 'success');
      setShowShareDialog(false);
      setSelectedQueryForShare(null);
    } catch (err: any) {
      showToast(`Failed to share query: ${err.message}`, 'error');
    } finally {
      setIsSharing(false);
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
        className="w-full px-3 py-2 text-sm font-medium text-white bg-[#1a1a1a] rounded-md hover:bg-[#2a2a2a] transition-colors"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
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
                className="px-4 py-2 text-sm font-medium text-white bg-[#1a1a1a] rounded-md hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex-1 px-3 py-1 text-xs font-medium text-[#1a1a1a] border border-[#dddddd] rounded hover:bg-[#f8f8f8]"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleShareQuery(query)}
                    className="flex-1 px-3 py-1 text-xs font-medium text-blue-600 border border-blue-300 rounded hover:bg-blue-50 inline-flex items-center justify-center gap-1"
                  >
                    <Share2 className="h-3 w-3" />
                    Share
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

      {/* Share Dialog */}
      {showShareDialog && selectedQueryForShare && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Share Cross-Query
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={shareForm.name}
                  onChange={(e) => setShareForm({ ...shareForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={shareForm.description}
                  onChange={(e) => setShareForm({ ...shareForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Level
                </label>
                <select
                  value={shareForm.accessLevel}
                  onChange={(e) => setShareForm({ ...shareForm, accessLevel: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#1a1a1a] focus:border-[#1a1a1a]"
                >
                  <option value="private">Private</option>
                  <option value="organization">Organization</option>
                  <option value="public">Public</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={shareForm.generateApiKey}
                    onChange={(e) => setShareForm({ ...shareForm, generateApiKey: e.target.checked })}
                    className="rounded border-gray-300 text-[#1a1a1a] focus:ring-[#1a1a1a]"
                  />
                  <span className="text-sm text-gray-700">Generate API Key (for programmatic access)</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={shareForm.generateShareToken}
                    onChange={(e) => setShareForm({ ...shareForm, generateShareToken: e.target.checked })}
                    className="rounded border-gray-300 text-[#1a1a1a] focus:ring-[#1a1a1a]"
                  />
                  <span className="text-sm text-gray-700">Generate Share Token (for read-only web access)</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowShareDialog(false);
                  setSelectedQueryForShare(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isSharing}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitShare}
                disabled={isSharing || !shareForm.name.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1a1a1a] rounded-md hover:bg-[#2a2a2a] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSharing ? 'Sharing...' : 'Share Query'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Query Confirmation Dialog */}
      <ConfirmDialog
        isOpen={loadConfirm.isOpen}
        onClose={() => setLoadConfirm({ isOpen: false, query: null })}
        onConfirm={confirmLoad}
        title="Load Query"
        message={`Load query "${loadConfirm.query?.name}"? This will replace your current query configuration.`}
        confirmText="Load"
        variant="info"
      />

      {/* Delete Query Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null, name: null })}
        onConfirm={confirmDelete}
        title="Delete Query"
        message={`Delete query "${deleteConfirm.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}
