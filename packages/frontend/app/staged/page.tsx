'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Staged Datasets</h1>
        <p className="text-muted-foreground mt-2">
          View and manage datasets that have been uploaded but not imported to a database
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Datasets List */}
        <div className="border rounded-lg">
          <div className="bg-muted px-4 py-3 border-b">
            <h2 className="font-semibold">Staged Datasets ({datasets.length})</h2>
          </div>
          <div className="overflow-auto max-h-[600px]">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading datasets...
              </div>
            ) : datasets.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="mb-4">No staged datasets found</p>
                <Link
                  href="/ingestion"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Upload a file to staging
                </Link>
              </div>
            ) : (
              <div className="divide-y">
                {datasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className={`p-4 hover:bg-muted cursor-pointer transition-colors ${
                      selectedDataset?.id === dataset.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => loadDatasetDetail(dataset.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{dataset.tableName}</h3>
                        {dataset.importJob && (
                          <p className="text-sm text-muted-foreground truncate">
                            From: {dataset.importJob.fileName}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
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
        <div className="border rounded-lg">
          <div className="bg-muted px-4 py-3 border-b">
            <h2 className="font-semibold">Dataset Details</h2>
          </div>
          <div className="overflow-auto max-h-[600px]">
            {!selectedDataset ? (
              <div className="p-8 text-center text-muted-foreground">
                Select a dataset to view details
              </div>
            ) : detailLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading details...
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Metadata */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{selectedDataset.tableName}</h3>
                  {selectedDataset.importJob && (
                    <div className="text-sm text-muted-foreground">
                      <p>Source: {selectedDataset.importJob.fileName}</p>
                      <p>Status: {selectedDataset.importJob.status}</p>
                    </div>
                  )}
                  <div className="flex gap-4 text-sm">
                    <span className="font-medium">Rows:</span>
                    <span>{selectedDataset.rowCount.toLocaleString()}</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="font-medium">Created:</span>
                    <span>{formatDate(selectedDataset.createdAt)}</span>
                  </div>
                </div>

                {/* Schema */}
                <div>
                  <h4 className="font-semibold mb-2">Schema</h4>
                  <div className="border rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-left">Column</th>
                          <th className="px-3 py-2 text-left">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Array.isArray(selectedDataset.schema) && selectedDataset.schema.map((col, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-mono text-xs">{col.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{col.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Data Preview (first 10 rows) */}
                <div>
                  <h4 className="font-semibold mb-2">Data Preview (first 10 rows)</h4>
                  {Array.isArray(selectedDataset.schema) && Array.isArray(selectedDataset.data) ? (
                    <>
                      <div className="border rounded overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              {selectedDataset.schema.map((col, idx) => (
                                <th key={idx} className="px-3 py-2 text-left text-xs font-mono whitespace-nowrap">
                                  {col.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {selectedDataset.data.slice(0, 10).map((row, rowIdx) => (
                              <tr key={rowIdx} className="hover:bg-muted">
                                {selectedDataset.schema.map((col, colIdx) => (
                                  <td key={colIdx} className="px-3 py-2 text-xs whitespace-nowrap">
                                    {row[col.name] !== null && row[col.name] !== undefined
                                      ? String(row[col.name])
                                      : <span className="text-muted-foreground italic">null</span>
                                    }
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {selectedDataset.rowCount > 10 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Showing 10 of {selectedDataset.rowCount.toLocaleString()} rows
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Invalid data format</p>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t space-y-2">
                  <p className="text-sm text-muted-foreground">
                    This data is stored in staging and can be queried alongside your database tables.
                  </p>
                  <Link
                    href="/query"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    Query This Data
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
