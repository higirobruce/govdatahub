'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, CheckSquare, Square, AlertTriangle } from 'lucide-react';

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

  // Single delete
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk select
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => { loadDatasets(); }, []);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const result = await api.ingestion.listStagedData(1000, 0);
      setDatasets(result.datasets || []);
      setSelected(new Set());
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
      if (typeof data.schema === 'string') data.schema = JSON.parse(data.schema);
      if (typeof data.data === 'string') data.data = JSON.parse(data.data);
      setSelectedDataset(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dataset details');
    } finally {
      setDetailLoading(false);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString();
  const getDisplayName = (dataset: StagedDataset) =>
    dataset.importJob?.fileName
      ? dataset.importJob.fileName.replace(/\.(csv|xlsx?|json)$/i, '')
      : dataset.tableName;

  // ── Single delete ────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      await api.ingestion.deleteStagedData(id);
      await loadDatasets();
      if (selectedDataset?.id === id) setSelectedDataset(null);
      setDeleteConfirmId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete staged dataset');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Bulk select helpers ───────────────────────────────────────────────────────
  const allSelected = datasets.length > 0 && selected.size === datasets.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(datasets.map(d => d.id)));
  const toggleOne = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Bulk delete ───────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    setBulkDeleting(true);
    setBulkProgress({ done: 0, total: ids.length });

    try {
      const result = await api.ingestion.deleteStagedDataBatch(ids);
      setBulkProgress({ done: result.deleted + result.failed, total: ids.length });
      if (result.failed) setError(`${result.failed} dataset(s) failed to delete.`);
    } catch (e: any) {
      setError(e.message || 'Batch delete failed.');
    }

    setBulkDeleting(false);
    setBulkProgress(null);
    setBulkDeleteConfirm(false);
    if (selectedDataset && selected.has(selectedDataset.id)) setSelectedDataset(null);
    await loadDatasets();
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
          <div className="bg-[#f8f8f8] px-6 py-4 border-b border-[#f0f0f0] flex items-center justify-between gap-3">
            <h2 className="font-semibold text-[#1a1a1a]">
              Staged Datasets ({datasets.length})
            </h2>
            {datasets.length > 0 && (
              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setBulkDeleteConfirm(true)}
                    className="bg-red-500 hover:bg-red-600 text-white flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete {selected.size === datasets.length ? 'All' : selected.size}
                  </Button>
                )}
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-1.5 text-xs text-[#555555] hover:text-[#1a1a1a]"
                  title={allSelected ? 'Deselect all' : 'Select all'}
                >
                  {allSelected
                    ? <CheckSquare className="w-4 h-4 text-indigo-500" />
                    : <Square className="w-4 h-4" />
                  }
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            )}
          </div>

          <div className="overflow-auto max-h-[600px]">
            {loading ? (
              <div className="p-8 text-center text-[#aaaaaa]">Loading datasets...</div>
            ) : datasets.length === 0 ? (
              <div className="p-8 text-center text-[#aaaaaa]">
                <p className="mb-4">No staged datasets found</p>
                <Link href="/ingestion" className="text-[#1a1a1a] hover:underline font-medium">
                  Upload a file to staging
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa] transition-colors ${
                      selectedDataset?.id === dataset.id ? 'bg-[#f8f8f8]' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={e => { e.stopPropagation(); toggleOne(dataset.id); }}
                      className="flex-shrink-0 text-gray-400 hover:text-indigo-500"
                    >
                      {selected.has(dataset.id)
                        ? <CheckSquare className="w-4 h-4 text-indigo-500" />
                        : <Square className="w-4 h-4" />
                      }
                    </button>

                    {/* Name + meta — clicking opens detail */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => loadDatasetDetail(dataset.id)}
                    >
                      <h3 className="font-medium truncate text-[#1a1a1a] text-sm">{getDisplayName(dataset)}</h3>
                      <p className="text-xs text-[#aaaaaa] truncate font-mono">{dataset.tableName}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[#aaaaaa]">
                        <span>{dataset.rowCount.toLocaleString()} rows</span>
                        <span>{formatDate(dataset.createdAt)}</span>
                      </div>
                    </div>

                    {/* Quick-delete single */}
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirmId(dataset.id); }}
                      className="flex-shrink-0 text-gray-300 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
              <div className="p-8 text-center text-[#aaaaaa]">Select a dataset to view details</div>
            ) : detailLoading ? (
              <div className="p-8 text-center text-[#aaaaaa]">Loading details...</div>
            ) : (
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-[#1a1a1a]">
                    {selectedDataset.importJob?.fileName
                      ? selectedDataset.importJob.fileName.replace(/\.(csv|xlsx?|json)$/i, '')
                      : selectedDataset.tableName}
                  </h3>
                  <div className="text-sm text-[#aaaaaa] space-y-1">
                    <p className="font-mono text-xs truncate">Table: {selectedDataset.tableName}</p>
                    {selectedDataset.importJob && <p>Status: {selectedDataset.importJob.status}</p>}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="font-medium text-[#555555]">Rows:</span>
                    <span>{selectedDataset.rowCount.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="font-medium text-[#555555]">Created:</span>
                    <span>{formatDate(selectedDataset.createdAt)}</span>
                  </div>
                </div>

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
                            <td className="px-3 py-2 font-mono text-xs">{col.name}</td>
                            <td className="px-3 py-2 text-[#555555]">{col.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {Array.isArray(selectedDataset.schema) && Array.isArray(selectedDataset.data) && (
                  <div>
                    <h4 className="font-semibold mb-2 text-[#1a1a1a]">Data Preview (first 10 rows)</h4>
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
                                <td key={colIdx} className="px-3 py-2 text-xs whitespace-nowrap">
                                  {row[col.name] != null ? String(row[col.name]) : <span className="text-[#aaaaaa] italic">null</span>}
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
                  </div>
                )}

                <div className="pt-4 border-t border-[#f0f0f0] flex gap-2">
                  <Button asChild>
                    <Link href="/query">Query This Data</Link>
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
            )}
          </div>
        </div>
      </div>

      {/* Single delete confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Staged Dataset</h3>
            <p className="text-sm text-[#555555] mb-4">
              This will permanently remove the staging table and all its data.
            </p>
            <div className="flex gap-3 justify-end">
              <Button onClick={() => setDeleteConfirmId(null)} disabled={isDeleting} variant="secondary">
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

      {/* Bulk delete confirmation */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold">
                  Delete {selected.size} dataset{selected.size !== 1 ? 's' : ''}?
                </h3>
                <p className="text-sm text-[#555555] mt-1">
                  This will permanently drop all {selected.size} staging tables and their data. This cannot be undone.
                </p>
              </div>
            </div>

            {bulkDeleting && bulkProgress && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Deleting…</span>
                  <span>{bulkProgress.done} / {bulkProgress.total}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-red-500 h-2 rounded-full transition-all"
                    style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button onClick={() => setBulkDeleteConfirm(false)} disabled={bulkDeleting} variant="secondary">
                Cancel
              </Button>
              <Button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="bg-[#ef4444] hover:bg-[#dc2626] text-white"
              >
                {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
