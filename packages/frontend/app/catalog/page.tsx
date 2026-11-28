'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { api, CatalogSearchResult } from '@/lib/api';
import { Connection } from '@/types';
import SchemaTree from '@/components/DataCatalog/SchemaTree';
import StagingDataCatalog from '@/components/DataCatalog/StagingDataCatalog';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { FolderOpen, Sparkles, Loader2 } from 'lucide-react';

type ViewMode = 'connections' | 'staging';

export default function CatalogPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('connections');

  // Semantic catalog search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);

  const { data: connections } = useSWR<Connection[]>('/connections', async () => {
    const result = await api.connections.list();
    return result as Connection[];
  });

  const handleQueryTable = (table: string, schema?: string) => {
    const fullTableName = schema ? `${schema}.${table}` : table;
    router.push(`/query?table=${encodeURIComponent(fullTableName)}&connection=${selectedConnectionId}`);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await api.catalogSearch.search(searchQuery.trim());
      setSearchResults(results);
    } catch (err: any) {
      showToast(err.message || 'Catalog search failed', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      const result = await api.catalogSearch.reindex();
      showToast(`Reindexed ${result.indexed} item${result.indexed === 1 ? '' : 's'}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Reindex failed', 'error');
    } finally {
      setIsReindexing(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Data Catalog"
        subtitle="Browse schemas, tables, and columns from all data sources"
      />

      {/* Semantic Search */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-6 mb-6">
        <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          Semantic Search
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="Search tables, columns, pipelines, queries…"
            className="flex-1 rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 py-2 text-sm rounded-md bg-[#1a1a1a] text-white hover:bg-[#2a2a2a] disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isSearching ? 'Searching…' : 'Search'}
          </button>
          <button
            onClick={handleReindex}
            disabled={isReindexing}
            className="px-3 py-2 text-xs rounded-md bg-[#f5f5f5] text-[#555555] hover:bg-[#eeeeee] disabled:opacity-50 transition-colors"
            title="Rebuild the semantic search index from the latest catalog data"
          >
            {isReindexing ? 'Reindexing…' : 'Reindex'}
          </button>
        </div>

        {isSearching && (
          <div className="mt-4 flex items-center justify-center py-6 text-sm text-[#aaaaaa]">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Searching catalog…
          </div>
        )}

        {!isSearching && searchResults !== null && (
          <div className="mt-4 space-y-2">
            {searchResults.length === 0 ? (
              <p className="text-sm text-[#aaaaaa] text-center py-4">No matches found</p>
            ) : (
              searchResults.map((result, idx) => (
                <div key={`${result.object_type}-${result.object_key}-${idx}`} className="border border-[#f0f0f0] rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono font-medium text-[#1a1a1a] truncate">{result.object_key}</span>
                    <span className="text-[10px] text-[#aaaaaa] shrink-0">score {result.score.toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-[#aaaaaa] mb-1">{result.object_type}</div>
                  <p className="text-xs text-[#555555]">{result.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card">
        <div className="border-b border-[#f0f0f0]">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setViewMode('connections')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'connections'
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
              }`}
            >
              Database Connections
            </button>
            <button
              onClick={() => setViewMode('staging')}
              className={`w-1/2 py-4 px-1 text-center border-b-2 font-medium text-sm transition-colors ${
                viewMode === 'staging'
                  ? 'border-[#1a1a1a] text-[#1a1a1a]'
                  : 'border-transparent text-[#555555] hover:text-[#1a1a1a] hover:border-[#e8e8e8]'
              }`}
            >
              Staging Data
            </button>
          </nav>
        </div>

        <div className="p-6">
          {viewMode === 'connections' ? (
            <>
              {/* Connection Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-[#555555] mb-2">
                  Select Database Connection *
                </label>
                <select
                  value={selectedConnectionId}
                  onChange={(e) => setSelectedConnectionId(e.target.value)}
                  className="block w-full rounded-md border border-[#dddddd] px-3 py-2 text-[13px] focus:border-[#1a1a1a] focus:ring-1 focus:ring-[#1a1a1a] outline-none"
                >
                  <option value="">-- Select a connection --</option>
                  {connections?.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.type} - {conn.database})
                    </option>
                  ))}
                </select>
                {!connections || connections.length === 0 ? (
                  <p className="mt-2 text-sm text-[#aaaaaa]">
                    No connections available.{' '}
                    <a href="/connections" className="text-[#1a1a1a] hover:underline font-medium">
                      Create one first
                    </a>
                  </p>
                ) : null}
              </div>

              {/* Schema Tree */}
              {selectedConnectionId ? (
                <div>
                  <h3 className="text-base font-semibold text-[#1a1a1a] mb-4">
                    Database Structure
                  </h3>
                  <SchemaTree
                    connectionId={selectedConnectionId}
                    onQueryTable={handleQueryTable}
                  />
                </div>
              ) : (
                <div className="text-center text-[#aaaaaa] py-12">
                  <FolderOpen className="mx-auto h-12 w-12 text-[#aaaaaa]" />
                  <h3 className="mt-2 text-sm font-medium text-[#1a1a1a]">
                    Select a connection
                  </h3>
                  <p className="mt-1 text-sm text-[#aaaaaa]">
                    Choose a database connection to explore its structure
                  </p>
                </div>
              )}
            </>
          ) : (
            <StagingDataCatalog />
          )}
        </div>
      </div>
    </div>
  );
}
