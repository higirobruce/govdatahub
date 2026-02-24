'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import {
  Library,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Database,
  Table2,
  GitBranch,
  Share2,
  Clock,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

interface CatalogStatus {
  configured: boolean;
  provider?: string;
  host?: string;
  enabled?: boolean;
  lastSyncAt?: string | null;
  lastSyncResult?: {
    created: number;
    updated: number;
    errors: string[];
  } | null;
}

export function CatalogIntegrationTab() {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [latestSyncResult, setLatestSyncResult] = useState<CatalogStatus['lastSyncResult'] | null>(null);

  const { data: status, isLoading, mutate } = useSWR<CatalogStatus>(
    '/catalog/status',
    () => api.catalog.getStatus(),
    { refreshInterval: 60000 },
  );

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setLatestSyncResult(null);
    try {
      const result = await api.catalog.sync();
      setLatestSyncResult(result);
      await mutate();
      showToast(`Sync complete — ${result.created} created, ${result.updated} updated`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await api.catalog.testConnection();
      showToast(result.message, result.ok ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message || 'Connection test failed', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-[#aaaaaa]">Loading catalog status...</div>
    );
  }

  // Not configured at all
  if (!status?.configured) {
    return (
      <div className="bg-white rounded-xl border border-[#e8e8e8] p-10 text-center">
        <Library className="h-12 w-12 text-[#dddddd] mx-auto mb-4" />
        <h3 className="text-base font-semibold text-[#1a1a1a] mb-2">
          No catalog integration configured
        </h3>
        <p className="text-sm text-[#aaaaaa] mb-6 max-w-sm mx-auto">
          Connect DataGate to OpenMetadata to push your schemas, pipelines, and
          lineage into your enterprise data catalog.
        </p>
        <Button
          onClick={() => router.push('/settings')}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Configure in Settings
        </Button>
      </div>
    );
  }

  const syncResult = latestSyncResult ?? status.lastSyncResult;

  return (
    <div className="space-y-4">
      {/* Status header card */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${status.enabled ? 'bg-indigo-50' : 'bg-[#f5f5f5]'}`}>
              <Library className={`h-5 w-5 ${status.enabled ? 'text-indigo-600' : 'text-[#aaaaaa]'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#1a1a1a] capitalize">
                  {status.provider ?? 'OpenMetadata'}
                </span>
                {status.enabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    <CheckCircle2 className="h-3 w-3" />
                    Enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#f0f0f0] text-[#555555]">
                    <XCircle className="h-3 w-3" />
                    Disabled
                  </span>
                )}
              </div>
              {status.host && (
                <a
                  href={status.host}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-0.5"
                >
                  {status.host}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting || !status.enabled}
            >
              {isTesting
                ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Wifi className="h-3.5 w-3.5 mr-1.5" />}
              Test
            </Button>
            <Button
              size="sm"
              onClick={handleSyncNow}
              disabled={isSyncing || !status.enabled}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing…' : 'Sync Now'}
            </Button>
          </div>
        </div>

        {/* Last sync line */}
        <div className="mt-4 pt-4 border-t border-[#f0f0f0] flex items-center gap-2 text-xs text-[#aaaaaa]">
          <Clock className="h-3.5 w-3.5" />
          {status.lastSyncAt
            ? `Last synced ${new Date(status.lastSyncAt).toLocaleString()}`
            : 'Never synced'}
        </div>
      </div>

      {/* Sync result stats */}
      {syncResult && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-[#e8e8e8] p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{syncResult.created}</div>
            <div className="text-xs text-[#aaaaaa] mt-1">Entities created</div>
          </div>
          <div className="bg-white rounded-xl border border-[#e8e8e8] p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{syncResult.updated}</div>
            <div className="text-xs text-[#aaaaaa] mt-1">Entities updated</div>
          </div>
          <div className="bg-white rounded-xl border border-[#e8e8e8] p-4 text-center">
            <div className={`text-2xl font-bold ${syncResult.errors.length > 0 ? 'text-red-500' : 'text-[#1a1a1a]'}`}>
              {syncResult.errors.length}
            </div>
            <div className="text-xs text-[#aaaaaa] mt-1">Errors</div>
          </div>
        </div>
      )}

      {/* Error list */}
      {syncResult && syncResult.errors.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700">Sync errors</span>
          </div>
          <ul className="space-y-1.5">
            {syncResult.errors.map((err, i) => (
              <li key={i} className="text-xs text-red-600 font-mono bg-red-50 px-3 py-1.5 rounded">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What gets synced */}
      <div className="bg-white rounded-xl border border-[#e8e8e8] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#f0f0f0]">
          <h3 className="text-sm font-semibold text-[#1a1a1a]">What's pushed to the catalog</h3>
          <p className="text-xs text-[#aaaaaa] mt-0.5">
            Each sync pushes the following assets to {status.provider ?? 'OpenMetadata'}
          </p>
        </div>
        <div className="divide-y divide-[#f0f0f0]">
          {[
            {
              icon: Database,
              label: 'Database Services',
              detail: 'One service per DataGate connection',
              color: 'text-blue-500',
            },
            {
              icon: Table2,
              label: 'Databases, Schemas & Tables',
              detail: 'Full column metadata included',
              color: 'text-green-500',
            },
            {
              icon: GitBranch,
              label: 'Pipelines & Transformations',
              detail: 'Pushed as Pipeline entities under "datagate-pipelines"',
              color: 'text-orange-500',
            },
            {
              icon: Share2,
              label: 'Lineage graph',
              detail: 'Table-level lineage edges',
              color: 'text-purple-500',
            },
            {
              icon: Clock,
              label: 'Query usage (last 7 days)',
              detail: 'Improves column popularity scores in the catalog',
              color: 'text-indigo-500',
            },
          ].map(({ icon: Icon, label, detail, color }) => (
            <div key={label} className="flex items-center gap-3 px-5 py-3">
              <Icon className={`h-4 w-4 ${color} shrink-0`} />
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#1a1a1a]">{label}</div>
                <div className="text-xs text-[#aaaaaa]">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disabled notice */}
      {!status.enabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <WifiOff className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Integration is disabled</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Enable it in{' '}
              <button
                onClick={() => router.push('/settings')}
                className="underline font-medium"
              >
                Settings → Catalog Integration
              </button>{' '}
              to start syncing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
