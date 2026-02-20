'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import {
  Database,
  Share2,
  Activity,
  Key,
  AlertTriangle,
  GitBranch,
  Globe,
  Lock,
  Eye,
  Trash2,
  RefreshCw,
} from 'lucide-react';

interface DashboardStats {
  totalDatasets: number;
  activeConnections: number;
  queriesToday: number;
  activeApiEndpoints: number;
  failedJobs: number;
  totalTransformations: number;
}

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

export default function Dashboard() {
  const [selectedDataset, setSelectedDataset] = useState<DatasetCatalogItem | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showShareDetails, setShowShareDetails] = useState(false);
  const [selectedShare, setSelectedShare] = useState<DatasetShare | null>(null);

  const { data: stats, isLoading: statsLoading } = useSWR<DashboardStats>(
    '/dashboard/stats',
    () => api.dashboard.getStats()
  );

  const { data: catalog, isLoading: catalogLoading, mutate: mutateCatalog } = useSWR<DatasetCatalogItem[]>(
    '/dashboard/catalog',
    () => api.dashboard.getCatalog()
  );

  const { data: shares, mutate: mutateShares } = useSWR<DatasetShare[]>(
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
      alert('Failed to load share details');
    }
  };

  const handleUnshare = async (dataset: DatasetCatalogItem) => {
    if (!dataset.shareId) return;
    if (!confirm('Are you sure you want to stop sharing this dataset?')) return;

    try {
      await api.dashboard.deleteShare(dataset.shareId);
      await mutateCatalog();
      await mutateShares();
      alert('Dataset unshared successfully');
    } catch (error) {
      console.error('Failed to unshare:', error);
      alert('Failed to unshare dataset');
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
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
          <Lock className="h-3 w-3" />
          Private
        </span>
      );
    }

    switch (level) {
      case 'organization':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
            <Eye className="h-3 w-3" />
            Organization
          </span>
        );
      case 'public':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
            <Globe className="h-3 w-3" />
            Public
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
            <Lock className="h-3 w-3" />
            Private
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Overview of your datasets, sharing, and activity
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Database className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Datasets
                  </dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {statsLoading ? '...' : stats?.totalDatasets || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Activity className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Active Connections
                  </dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {statsLoading ? '...' : stats?.activeConnections || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Share2 className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Queries Today
                  </dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {statsLoading ? '...' : stats?.queriesToday || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Key className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Active API Endpoints
                  </dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {statsLoading ? '...' : stats?.activeApiEndpoints || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Failed Jobs
                  </dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {statsLoading ? '...' : stats?.failedJobs || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <GitBranch className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Transformations
                  </dt>
                  <dd className="text-3xl font-semibold text-gray-900">
                    {statsLoading ? '...' : stats?.totalTransformations || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Catalog */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Data Catalog
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            All datasets available in your organization
          </p>
        </div>
        <div className="overflow-x-auto">
          {catalogLoading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : !catalog || catalog.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No datasets found. Import data or connect to a database to get started.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dataset
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                    Table Name
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Access
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {catalog.map((dataset) => (
                  <tr key={dataset.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-[12rem]">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex-shrink-0">
                          {getTypeIcon(dataset.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-xs text-gray-900 font-mono block truncate"
                            title={dataset.name}
                          >
                            {dataset.name}
                          </div>
                          <div
                            className="text-xs text-gray-500 truncate"
                            title={dataset.description}
                          >
                            {dataset.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700 capitalize">
                        {dataset.type}
                      </span>
                    </td>
                    <td className="px-3 py-3 max-w-[12rem]">
                      <code
                        className="text-xs text-gray-900 font-mono block truncate"
                        title={dataset.tableName}
                      >
                        {dataset.tableName}
                      </code>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                      {dataset.rowCount.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                      {dataset.source}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {getAccessLevelBadge(dataset.accessLevel, dataset.isShared)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                      {new Date(dataset.lastUpdated).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {!dataset.isShared ? (
                          <button
                            onClick={() => handleShareDataset(dataset)}
                            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-900 text-xs"
                            title="Share this dataset"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            Share
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleViewShare(dataset)}
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900 text-xs"
                              title="View share details"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleUnshare(dataset)}
                              className="inline-flex items-center gap-1 text-red-600 hover:text-red-900 text-xs"
                              title="Stop sharing"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </div>
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
      alert('Dataset shared successfully!');
      onSuccess();
    } catch (error) {
      console.error('Failed to share dataset:', error);
      alert('Failed to share dataset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Share Dataset</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Share Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              rows={3}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Access Level
            </label>
            <select
              value={formData.accessLevel}
              onChange={(e) => setFormData({ ...formData, accessLevel: e.target.value as any })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
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
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Generate API Key for programmatic access</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.generateShareToken}
                onChange={(e) => setFormData({ ...formData, generateShareToken: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">Generate Share Token for external sharing</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Sharing...' : 'Share Dataset'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
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
      alert('API key regenerated successfully');
      onUpdate();
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      alert('Failed to regenerate API key');
    }
  };

  const handleRegenerateShareToken = async () => {
    if (!confirm('Are you sure? This will invalidate the current share token.')) return;
    try {
      await api.dashboard.regenerateShareToken(share.id);
      alert('Share token regenerated successfully');
      onUpdate();
    } catch (error) {
      console.error('Failed to regenerate share token:', error);
      alert('Failed to regenerate share token');
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Share Details</h2>
        </div>
        <div className="px-6 py-4 space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{share.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{share.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Dataset Type</div>
              <div className="text-sm font-medium text-gray-900 capitalize">{share.datasetType}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Access Level</div>
              <div className="text-sm font-medium text-gray-900 capitalize">{share.accessLevel}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Access Count</div>
              <div className="text-sm font-medium text-gray-900">{share.accessCount}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Created</div>
              <div className="text-sm font-medium text-gray-900">
                {new Date(share.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>

          {share.apiKey && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">API Access</h4>
                <button
                  onClick={handleRegenerateApiKey}
                  className="text-xs text-indigo-600 hover:text-indigo-900 flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">API Key</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 px-3 py-2 rounded text-xs font-mono break-all">
                    {share.apiKey}
                  </code>
                  <button
                    onClick={() => handleCopy(share.apiKey!, 'API Key')}
                    className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                  >
                    {copying === 'API Key' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">API Endpoint</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 px-3 py-2 rounded text-xs font-mono break-all">
                    GET {apiUrl}
                  </code>
                  <button
                    onClick={() => handleCopy(apiUrl!, 'API URL')}
                    className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                  >
                    {copying === 'API URL' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="text-xs font-medium text-blue-900 mb-2">Example Usage (cURL)</div>
                <code className="block bg-white px-3 py-2 rounded text-xs font-mono whitespace-pre-wrap break-all">
                  {`curl -X GET "${apiUrl}"`}
                </code>
              </div>
            </div>
          )}

          {share.shareToken && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">External Sharing</h4>
                <button
                  onClick={handleRegenerateShareToken}
                  className="text-xs text-indigo-600 hover:text-indigo-900 flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </button>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Share Token</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 px-3 py-2 rounded text-xs font-mono break-all">
                    {share.shareToken}
                  </code>
                  <button
                    onClick={() => handleCopy(share.shareToken!, 'Share Token')}
                    className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                  >
                    {copying === 'Share Token' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Share URL</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 px-3 py-2 rounded text-xs font-mono break-all">
                    {shareUrl}
                  </code>
                  <button
                    onClick={() => handleCopy(shareUrl!, 'Share URL')}
                    className="text-xs text-indigo-600 hover:text-indigo-900 whitespace-nowrap"
                  >
                    {copying === 'Share URL' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
