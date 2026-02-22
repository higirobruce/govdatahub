'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import {
  Database,
  Share2,
  GitBranch,
  Globe,
  Lock,
  Eye,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

interface DatasetCatalogItem {
  id: string;
  name: string;
  description: string;
  type: 'staged' | 'connection' | 'transformation';
  tableName: string;
  rowCount: number;
  lastUpdated: string;
  source: string;
  isShared: boolean;
  accessLevel: 'private' | 'organization' | 'public';
  shareId?: string;
}

interface DatasetShare {
  id: string;
  name: string;
  description: string;
  datasetType: string;
  datasetId: string;
  tableName?: string;
  accessLevel: string;
  apiKey?: string;
  shareToken?: string;
  active: boolean;
  accessCount: number;
  createdAt: string;
  lastAccessedAt?: string;
}

export function CatalogTab() {
  const { showToast } = useToast();
  const [selectedDataset, setSelectedDataset] = useState<DatasetCatalogItem | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showShareDetails, setShowShareDetails] = useState(false);
  const [selectedShare, setSelectedShare] = useState<DatasetShare | null>(null);

  const { data: catalog, isLoading: catalogLoading, mutate: mutateCatalog } = useSWR<DatasetCatalogItem[]>(
    '/dashboard/catalog',
    () => api.dashboard.getCatalog()
  );

  const { mutate: mutateShares } = useSWR<DatasetShare[]>(
    '/dashboard/shares',
    () => api.dashboard.getShares()
  );

  const handleShareDataset = (dataset: DatasetCatalogItem) => {
    setSelectedDataset(dataset);
    setShowShareDialog(true);
  };

  const handleViewShare = async (dataset: DatasetCatalogItem) => {
    if (!dataset.shareId) return;
    try {
      const share = await api.dashboard.getShare(dataset.shareId);
      setSelectedShare(share);
      setShowShareDetails(true);
    } catch (error) {
      console.error('Failed to load share details:', error);
      showToast('Failed to load share details', 'error');
    }
  };

  const handleUnshare = async (dataset: DatasetCatalogItem) => {
    if (!dataset.shareId) return;
    if (!confirm('Are you sure you want to stop sharing this dataset?')) return;

    try {
      await api.dashboard.deleteShare(dataset.shareId);
      await mutateCatalog();
      await mutateShares();
      showToast('Dataset unshared successfully', 'success');
    } catch (error) {
      console.error('Failed to unshare:', error);
      showToast('Failed to unshare dataset', 'error');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'staged':
        return <Database className="h-4 w-4" />;
      case 'connection':
        return <Database className="h-4 w-4" />;
      case 'transformation':
        return <GitBranch className="h-4 w-4" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  const getAccessLevelBadge = (level: string, isShared: boolean) => {
    if (!isShared) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[#f0f0f0] text-[#555555]">
          <Lock className="h-3 w-3" />
          Private
        </span>
      );
    }

    switch (level) {
      case 'organization':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[#dbeafe] text-[#1e40af]">
            <Eye className="h-3 w-3" />
            Organization
          </span>
        );
      case 'public':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[#d1fae5] text-[#065f46]">
            <Globe className="h-3 w-3" />
            Public
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[#f0f0f0] text-[#555555]">
            <Lock className="h-3 w-3" />
            Private
          </span>
        );
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#f0f0f0]">
          <h3 className="text-base font-semibold text-[#1a1a1a]">
            Data Catalog
          </h3>
          <p className="mt-1 text-sm text-[#aaaaaa]">
            All datasets available in your organization
          </p>
        </div>
        <div className="overflow-x-auto">
          {catalogLoading ? (
            <div className="p-6 text-center text-[#aaaaaa]">Loading...</div>
          ) : !catalog || catalog.length === 0 ? (
            <div className="p-6 text-center text-[#aaaaaa]">
              No datasets found. Import data or connect to a database to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-48">Table Name</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.map((dataset) => (
                  <TableRow key={dataset.id}>
                    <TableCell className="max-w-[12rem]">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-shrink-0">
                          {getTypeIcon(dataset.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-xs text-[#1a1a1a] font-mono block truncate"
                            title={dataset.name}
                          >
                            {dataset.name}
                          </div>
                          <div
                            className="text-xs text-[#aaaaaa] truncate"
                            title={dataset.description}
                          >
                            {dataset.description}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-[#f0f0f0] text-[#555555] capitalize">
                        {dataset.type}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      <code
                        className="text-xs text-[#1a1a1a] font-mono block truncate"
                        title={dataset.tableName}
                      >
                        {dataset.tableName}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-[#555555]">
                      {dataset.rowCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-[#555555]">
                      {dataset.source}
                    </TableCell>
                    <TableCell>
                      {getAccessLevelBadge(dataset.accessLevel, dataset.isShared)}
                    </TableCell>
                    <TableCell className="text-xs text-[#aaaaaa]">
                      {new Date(dataset.lastUpdated).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!dataset.isShared ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShareDataset(dataset)}
                            className="h-7 px-2"
                          >
                            <Share2 className="h-3.5 w-3.5 mr-1" />
                            Share
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewShare(dataset)}
                              className="h-7 px-2"
                              title="View share details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnshare(dataset)}
                              className="h-7 px-2 text-[#ef4444] hover:text-[#dc2626]"
                              title="Stop sharing"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Share Dataset Dialog */}
      {showShareDialog && selectedDataset && (
        <ShareDatasetDialog
          dataset={selectedDataset}
          onClose={() => {
            setShowShareDialog(false);
            setSelectedDataset(null);
          }}
          onSuccess={() => {
            mutateCatalog();
            mutateShares();
            setShowShareDialog(false);
            setSelectedDataset(null);
          }}
        />
      )}

      {/* Share Details Dialog */}
      {showShareDetails && selectedShare && (
        <ShareDetailsDialog
          share={selectedShare}
          onClose={() => {
            setShowShareDetails(false);
            setSelectedShare(null);
          }}
          onUpdate={async () => {
            if (selectedShare) {
              const updated = await api.dashboard.getShare(selectedShare.id);
              setSelectedShare(updated);
              await mutateCatalog();
              await mutateShares();
            }
          }}
        />
      )}
    </>
  );
}

// Share Dataset Dialog Component
function ShareDatasetDialog({
  dataset,
  onClose,
  onSuccess,
}: {
  dataset: DatasetCatalogItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    name: dataset.name,
    description: dataset.description,
    accessLevel: 'private' as 'private' | 'organization' | 'public',
    generateApiKey: false,
    generateShareToken: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await api.dashboard.createShare({
        name: formData.name,
        description: formData.description,
        datasetType: dataset.type,
        datasetId: dataset.id,
        tableName: dataset.tableName,
        accessLevel: formData.accessLevel,
        generateApiKey: formData.generateApiKey,
        generateShareToken: formData.generateShareToken,
      });
      showToast('Dataset shared successfully!', 'success');
      onSuccess();
    } catch (error) {
      console.error('Failed to share dataset:', error);
      showToast('Failed to share dataset', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-[#f0f0f0]">
          <h2 className="text-xl font-semibold text-[#1a1a1a]">Share Dataset</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#555555]">
              Share Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#555555]">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#555555]">
              Access Level
            </label>
            <select
              value={formData.accessLevel}
              onChange={(e) => setFormData({ ...formData, accessLevel: e.target.value as any })}
              className="mt-1 block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
            >
              <option value="private">Private (Not accessible)</option>
              <option value="organization">Organization (Your organization members)</option>
              <option value="public">Public (Anyone with link)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.generateApiKey}
                onChange={(e) => setFormData({ ...formData, generateApiKey: e.target.checked })}
                className="rounded border-[#dddddd] text-[#1a1a1a] focus:ring-[#1a1a1a]"
              />
              <span className="text-sm text-[#555555]">Generate API Key for programmatic access</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.generateShareToken}
                onChange={(e) => setFormData({ ...formData, generateShareToken: e.target.checked })}
                className="rounded border-[#dddddd] text-[#1a1a1a] focus:ring-[#1a1a1a]"
              />
              <span className="text-sm text-[#555555]">Generate Share Token for external sharing</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Sharing...' : 'Share Dataset'}
            </Button>
            <Button
              type="button"
              onClick={onClose}
              variant="secondary"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Share Details Dialog Component
function ShareDetailsDialog({
  share,
  onClose,
  onUpdate,
}: {
  share: DatasetShare;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { showToast } = useToast();
  const [copying, setCopying] = useState<string | null>(null);

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopying(label);
    setTimeout(() => setCopying(null), 2000);
  };

  const handleRegenerateApiKey = async () => {
    if (!confirm('Are you sure? This will invalidate the current API key.')) return;
    try {
      await api.dashboard.regenerateApiKey(share.id);
      showToast('API key regenerated successfully', 'success');
      onUpdate();
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      showToast('Failed to regenerate API key', 'error');
    }
  };

  const handleRegenerateShareToken = async () => {
    if (!confirm('Are you sure? This will invalidate the current share token.')) return;
    try {
      await api.dashboard.regenerateShareToken(share.id);
      showToast('Share token regenerated successfully', 'success');
      onUpdate();
    } catch (error) {
      console.error('Failed to regenerate share token:', error);
      showToast('Failed to regenerate share token', 'error');
    }
  };

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const apiUrl = share.apiKey
    ? `${backendUrl}/public/datasets/${share.apiKey}`
    : null;
  const shareUrl = share.shareToken
    ? `${backendUrl}/public/shared/${share.shareToken}`
    : null;

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-[#f0f0f0]">
          <h2 className="text-xl font-semibold text-[#1a1a1a]">Share Details</h2>
        </div>
        <div className="px-6 py-4 space-y-6">
          <div>
            <h3 className="text-lg font-medium text-[#1a1a1a]">{share.name}</h3>
            <p className="text-sm text-[#aaaaaa] mt-1">{share.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-[#aaaaaa]">Dataset Type</div>
              <div className="text-sm font-medium text-[#1a1a1a] capitalize">{share.datasetType}</div>
            </div>
            <div>
              <div className="text-sm text-[#aaaaaa]">Access Level</div>
              <div className="text-sm font-medium text-[#1a1a1a] capitalize">{share.accessLevel}</div>
            </div>
            <div>
              <div className="text-sm text-[#aaaaaa]">Access Count</div>
              <div className="text-sm font-medium text-[#1a1a1a]">{share.accessCount}</div>
            </div>
            <div>
              <div className="text-sm text-[#aaaaaa]">Created</div>
              <div className="text-sm font-medium text-[#1a1a1a]">
                {new Date(share.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {share.apiKey && (
            <div className="border border-[#e8e8e8] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#1a1a1a]">API Access</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerateApiKey}
                  className="h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Regenerate
                </Button>
              </div>
              <div>
                <div className="text-xs text-[#aaaaaa] mb-1">API Key</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#f8f8f8] px-3 py-2 rounded text-xs font-mono break-all">
                    {share.apiKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(share.apiKey!, 'API Key')}
                    className="h-7 text-xs whitespace-nowrap"
                  >
                    {copying === 'API Key' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs text-[#aaaaaa] mb-1">API Endpoint</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#f8f8f8] px-3 py-2 rounded text-xs font-mono break-all">
                    GET {apiUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(apiUrl!, 'API URL')}
                    className="h-7 text-xs whitespace-nowrap"
                  >
                    {copying === 'API URL' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div className="bg-[#dbeafe] border border-[#93c5fd] rounded p-3">
                <div className="text-xs font-medium text-[#1e40af] mb-2">Example Usage (cURL)</div>
                <code className="block bg-white px-3 py-2 rounded text-xs font-mono whitespace-pre-wrap break-all">
                  {`curl -X GET "${apiUrl}"`}
                </code>
              </div>
            </div>
          )}

          {share.shareToken && (
            <div className="border border-[#e8e8e8] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-[#1a1a1a]">External Sharing</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRegenerateShareToken}
                  className="h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Regenerate
                </Button>
              </div>
              <div>
                <div className="text-xs text-[#aaaaaa] mb-1">Share Token</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#f8f8f8] px-3 py-2 rounded text-xs font-mono break-all">
                    {share.shareToken}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(share.shareToken!, 'Share Token')}
                    className="h-7 text-xs whitespace-nowrap"
                  >
                    {copying === 'Share Token' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs text-[#aaaaaa] mb-1">Share URL</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-[#f8f8f8] px-3 py-2 rounded text-xs font-mono break-all">
                    {shareUrl}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(shareUrl!, 'Share URL')}
                    className="h-7 text-xs whitespace-nowrap"
                  >
                    {copying === 'Share URL' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#f0f0f0]">
          <Button
            onClick={onClose}
            variant="secondary"
            className="w-full"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
