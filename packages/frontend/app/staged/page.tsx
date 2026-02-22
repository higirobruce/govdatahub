'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface StagedDataset {
  id: string;
  tableName: string;
  rowCount: number;
  createdAt: string;
  importJobId: string;
  importJob?: {
    id: string;
    fileName: string;
    status: string;
  };
}

interface StagedDataDetail {
  id: string;
  tableName: string;
  schema: Array<{ name: string; type: string; sample: any }>;
  data: any[];
  rowCount: number;
  createdAt: string;
  importJob?: {
    fileName: string;
    status: string;
  };
}

export default function StagedDataPage() {
  const [datasets, setDatasets] = useState<StagedDataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<StagedDataDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const result = await api.ingestion.listStagedData(100, 0);
      setDatasets(result.datasets || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load staged datasets');
    } finally {
      setLoading(false);
    }
  };

  const loadDatasetDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      const data = await api.ingestion.getStagedData(id);

      // Parse schema and data if they're strings (legacy format)
      if (typeof data.schema === 'string') {
        data.schema = JSON.parse(data.schema);
      }
      if (typeof data.data === 'string') {
        data.data = JSON.parse(data.data);
      }

      setSelectedDataset(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dataset details');
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (rowCount: number) => {
    return `${rowCount.toLocaleString()} rows`;
  };

  const getDisplayName = (dataset: StagedDataset) => {
    // Use the source file name without extension if available
    if (dataset.importJob?.fileName) {
      return dataset.importJob.fileName.replace(/\.(csv|xlsx?|json)$/i, '');
    }
    // Fallback to table name
    return dataset.tableName;
  };

  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      await api.ingestion.deleteStagedData(id);

      // Reload datasets list
      await loadDatasets();

      // Clear selected dataset if it was the one deleted
      if (selectedDataset?.id === id) {
        setSelectedDataset(null);
      }

      setDeleteConfirmId(null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete staged dataset');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Staged Datasets"
        subtitle="View and manage datasets that have been uploaded but not imported to a database"
        icon={FileText}
      />

      {error && (
        <div className="bg-[#fee2e2] border border-[#fca5a5] text-[#991b1b] px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Datasets List */}
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
          <div className="bg-[#f8f8f8] px-6 py-4 border-b border-[#f0f0f0]">
            <h2 className="font-semibold text-[#1a1a1a]">Staged Datasets ({datasets.length})</h2>
          </div>
          <div className="overflow-auto max-h-[600px]">
            {loading ? (
              <div className="p-8 text-center text-[#aaaaaa]">
                Loading datasets...
              </div>
            ) : datasets.length === 0 ? (
              <div className="p-8 text-center text-[#aaaaaa]">
                <p className="mb-4">No staged datasets found</p>
                <Link
                  href="/ingestion"
                  className="text-[#1a1a1a] hover:underline font-medium"
                >
                  Upload a file to staging
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className={`p-4 hover:bg-[#fafafa] cursor-pointer transition-colors ${
                      selectedDataset?.id === dataset.id ? 'bg-[#f8f8f8]' : ''
                    }`}
                    onClick={() => loadDatasetDetail(dataset.id)}
                    title={`Table: ${dataset.tableName}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate text-[#1a1a1a]">{getDisplayName(dataset)}</h3>
                        <p className="text-xs text-[#aaaaaa] truncate font-mono">
                          {dataset.tableName}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-[#aaaaaa]">
                          <span>{formatFileSize(dataset.rowCount)}</span>
                          <span>{formatDate(dataset.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dataset Detail */}
        <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
          <div className="bg-[#f8f8f8] px-6 py-4 border-b border-[#f0f0f0]">
            <h2 className="font-semibold text-[#1a1a1a]">Dataset Details</h2>
          </div>
          <div className="overflow-auto max-h-[600px]">
            {!selectedDataset ? (
              <div className="p-8 text-center text-[#aaaaaa]">
                Select a dataset to view details
              </div>
            ) : detailLoading ? (
              <div className="p-8 text-center text-[#aaaaaa]">
                Loading details...
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* Metadata */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-[#1a1a1a]">
                    {selectedDataset.importJob?.fileName
                      ? selectedDataset.importJob.fileName.replace(/\.(csv|xlsx?|json)$/i, '')
                      : selectedDataset.tableName}
                  </h3>
                  <div className="text-sm text-[#aaaaaa] space-y-1">
                    <p className="font-mono text-xs truncate" title={selectedDataset.tableName}>
                      Table: {selectedDataset.tableName}
                    </p>
                    {selectedDataset.importJob && (
                      <p>Status: {selectedDataset.importJob.status}</p>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="font-medium text-[#555555]">Rows:</span>
                    <span className="text-[#1a1a1a]">{selectedDataset.rowCount.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="font-medium text-[#555555]">Created:</span>
                    <span className="text-[#1a1a1a]">{formatDate(selectedDataset.createdAt)}</span>
                  </div>
                </div>

                {/* Schema */}
                <div>
                  <h4 className="font-semibold mb-2 text-[#1a1a1a]">Schema</h4>
                  <div className="border border-[#e8e8e8] rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-[#f8f8f8]">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs text-[#aaaaaa] font-medium">Column</th>
                          <th className="px-3 py-2 text-left text-xs text-[#aaaaaa] font-medium">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f0f0f0]">
                        {Array.isArray(selectedDataset.schema) && selectedDataset.schema.map((col, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-mono text-xs text-[#1a1a1a]">{col.name}</td>
                            <td className="px-3 py-2 text-[#555555]">{col.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Data Preview (first 10 rows) */}
                <div>
                  <h4 className="font-semibold mb-2 text-[#1a1a1a]">Data Preview (first 10 rows)</h4>
                  {Array.isArray(selectedDataset.schema) && Array.isArray(selectedDataset.data) ? (
                    <>
                      <div className="border border-[#e8e8e8] rounded overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#f8f8f8] sticky top-0">
                            <tr>
                              {selectedDataset.schema.map((col, idx) => (
                                <th key={idx} className="px-3 py-2 text-left text-xs text-[#aaaaaa] font-mono whitespace-nowrap font-medium">
                                  {col.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f0f0f0]">
                            {selectedDataset.data.slice(0, 10).map((row, rowIdx) => (
                              <tr key={rowIdx} className="hover:bg-[#fafafa]">
                                {selectedDataset.schema.map((col, colIdx) => (
                                  <td key={colIdx} className="px-3 py-2 text-xs whitespace-nowrap text-[#1a1a1a]">
                                    {row[col.name] !== null && row[col.name] !== undefined
                                      ? String(row[col.name])
                                      : <span className="text-[#aaaaaa] italic">null</span>
                                    }
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {selectedDataset.rowCount > 10 && (
                        <p className="text-xs text-[#aaaaaa] mt-2">
                          Showing 10 of {selectedDataset.rowCount.toLocaleString()} rows
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[#aaaaaa]">Invalid data format</p>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-[#f0f0f0] space-y-3">
                  <p className="text-sm text-[#aaaaaa]">
                    This data is stored in staging and can be queried alongside your database tables.
                  </p>
                  <div className="flex gap-2">
                    <Button asChild>
                      <Link href="/query">
                        Query This Data
                      </Link>
                    </Button>
                    <Button
                      onClick={() => setDeleteConfirmId(selectedDataset.id)}
                      variant="outline"
                      className="text-[#ef4444] border-[#fca5a5] hover:bg-[#fee2e2]"
                    >
                      Delete Dataset
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2 text-[#1a1a1a]">Delete Staged Dataset</h3>
            <p className="text-sm text-[#555555] mb-4">
              Are you sure you want to delete this staged dataset? This action cannot be undone.
              The staging table and all its data will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={isDeleting}
                className="bg-[#ef4444] hover:bg-[#dc2626] text-white"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
