'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import {
  Activity,
  TrendingUp,
  Database,
  Share2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Server,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function DashboardAnalytics() {
  // Fetch all analytics data
  const { data: queryPerf, isLoading: queryPerfLoading } = useSWR(
    '/dashboard/analytics/query-performance',
    () => api.dashboard.getQueryPerformance(),
    { refreshInterval: 30000 } // Refresh every 30 seconds
  );

  const { data: sharedDatasets, isLoading: sharedLoading } = useSWR(
    '/dashboard/analytics/shared-datasets',
    () => api.dashboard.getSharedDatasetStats(),
    { refreshInterval: 30000 }
  );

  const { data: dataFreshness, isLoading: freshnessLoading } = useSWR(
    '/dashboard/analytics/data-freshness',
    () => api.dashboard.getDataFreshnessStats(),
    { refreshInterval: 60000 } // Refresh every minute
  );

  const { data: connectionHealth, isLoading: healthLoading } = useSWR(
    '/dashboard/analytics/connection-health',
    () => api.dashboard.getConnectionHealthStats(),
    { refreshInterval: 30000 }
  );

  const isLoading = queryPerfLoading || sharedLoading || freshnessLoading || healthLoading;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Dashboard Analytics"
        subtitle="Real-time insights into platform performance and health"
      />

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          name="Avg Query Time"
          subtitle={`${queryPerf?.totalQueries || 0} total queries`}
          value={isLoading ? '...' : `${queryPerf?.avgExecutionTimeMs || 0}ms`}
          icon={Clock}
          iconColor={
            (queryPerf?.avgExecutionTimeMs || 0) > 5000
              ? 'red'
              : (queryPerf?.avgExecutionTimeMs || 0) > 2000
              ? 'orange'
              : 'green'
          }
        />

        <StatCard
          name="Query Success"
          subtitle="Last 7 days"
          value={isLoading ? '...' : `${Math.round(100 - (queryPerf?.failureRate || 0))}%`}
          icon={CheckCircle2}
          iconColor={
            (queryPerf?.failureRate || 0) > 10
              ? 'red'
              : (queryPerf?.failureRate || 0) > 5
              ? 'orange'
              : 'green'
          }
          progressPercent={isLoading ? 0 : (100 - (queryPerf?.failureRate || 0))}
          progressColor={
            (queryPerf?.failureRate || 0) > 10
              ? 'red'
              : (queryPerf?.failureRate || 0) > 5
              ? 'orange'
              : 'green'
          }
        />

        <StatCard
          name="Shared Datasets"
          subtitle="Active API endpoints"
          value={isLoading ? '...' : String(sharedDatasets?.totalSharedDatasets || 0)}
          icon={Share2}
          iconColor="blue"
        />

        <StatCard
          name="API Calls Today"
          subtitle={`${sharedDatasets?.totalApiCalls || 0} total`}
          value={isLoading ? '...' : String(sharedDatasets?.apiCallsToday || 0)}
          icon={Zap}
          iconColor="orange"
        />

        <StatCard
          name="Connections"
          subtitle={`${connectionHealth?.onlineConnections || 0}/${connectionHealth?.totalConnections || 0} online`}
          value={
            isLoading
              ? '...'
              : connectionHealth?.totalConnections
              ? `${Math.round((connectionHealth.onlineConnections / connectionHealth.totalConnections) * 100)}%`
              : '0%'
          }
          icon={Database}
          iconColor={
            (connectionHealth?.errorConnections || 0) > 0
              ? 'red'
              : (connectionHealth?.offlineConnections || 0) > 0
              ? 'orange'
              : 'green'
          }
          progressPercent={
            isLoading
              ? 0
              : connectionHealth?.totalConnections
              ? (connectionHealth.onlineConnections / connectionHealth.totalConnections) * 100
              : 0
          }
          progressColor={
            (connectionHealth?.errorConnections || 0) > 0
              ? 'red'
              : (connectionHealth?.offlineConnections || 0) > 0
              ? 'orange'
              : 'green'
          }
        />

        <StatCard
          name="Data Quality"
          subtitle={`${dataFreshness?.totalTransformations || 0} transformations`}
          value={isLoading ? '...' : `${Math.round(dataFreshness?.transformationSuccessRate || 100)}%`}
          icon={Activity}
          iconColor={
            (dataFreshness?.transformationSuccessRate || 100) < 85
              ? 'red'
              : (dataFreshness?.transformationSuccessRate || 100) < 95
              ? 'orange'
              : 'green'
          }
          progressPercent={isLoading ? 0 : (dataFreshness?.transformationSuccessRate || 100)}
          progressColor={
            (dataFreshness?.transformationSuccessRate || 100) < 85
              ? 'red'
              : (dataFreshness?.transformationSuccessRate || 100) < 95
              ? 'orange'
              : 'green'
          }
        />
      </div>

      {/* Query Performance Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Slowest Queries</CardTitle>
            <p className="text-sm text-[#aaaaaa]">Top 10 slowest executing queries (last 7 days)</p>
          </CardHeader>
          <CardContent>
            {queryPerfLoading ? (
              <div className="text-center text-[#aaaaaa] py-8">Loading...</div>
            ) : !queryPerf?.slowestQueries || queryPerf.slowestQueries.length === 0 ? (
              <div className="text-center text-[#aaaaaa] py-8">No queries found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Executed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queryPerf.slowestQueries.map((query: any) => (
                      <TableRow key={query.id}>
                        <TableCell className="max-w-[20rem]">
                          <code className="text-xs font-mono block truncate" title={query.sqlQuery}>
                            {query.sqlQuery}
                          </code>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-sm font-medium ${
                              query.executionTimeMs > 5000
                                ? 'text-[#ef4444]'
                                : query.executionTimeMs > 2000
                                ? 'text-[#fb923c]'
                                : 'text-[#4ade80]'
                            }`}
                          >
                            {query.executionTimeMs}ms
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-[#aaaaaa]">
                          {new Date(query.executedAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Accessed Shared Datasets</CardTitle>
            <p className="text-sm text-[#aaaaaa]">Top datasets by API call volume</p>
          </CardHeader>
          <CardContent>
            {sharedLoading ? (
              <div className="text-center text-[#aaaaaa] py-8">Loading...</div>
            ) : !sharedDatasets?.mostAccessedDatasets || sharedDatasets.mostAccessedDatasets.length === 0 ? (
              <div className="text-center text-[#aaaaaa] py-8">No shared datasets found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Calls</TableHead>
                      <TableHead>Last Access</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sharedDatasets.mostAccessedDatasets.map((dataset: any) => (
                      <TableRow key={dataset.id}>
                        <TableCell className="max-w-[12rem]">
                          <div className="text-xs text-[#1a1a1a] font-medium truncate" title={dataset.name}>
                            {dataset.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-1.5 py-0.5 text-xs rounded bg-[#f0f0f0] text-[#555555] capitalize">
                            {dataset.datasetType}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{dataset.accessCount}</TableCell>
                        <TableCell className="text-xs text-[#aaaaaa]">
                          {dataset.lastAccessedAt
                            ? new Date(dataset.lastAccessedAt).toLocaleDateString()
                            : 'Never'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Health Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#fb923c]" />
              Stale Datasets
            </CardTitle>
            <p className="text-sm text-[#aaaaaa]">Datasets not accessed in 30+ days</p>
          </CardHeader>
          <CardContent>
            {freshnessLoading ? (
              <div className="text-center text-[#aaaaaa] py-8">Loading...</div>
            ) : !dataFreshness?.staleDatasetsList || dataFreshness.staleDatasetsList.length === 0 ? (
              <div className="text-center text-[#4ade80] py-8 flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                All datasets are being actively used
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Days Idle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataFreshness.staleDatasetsList.map((dataset: any) => (
                      <TableRow key={dataset.id}>
                        <TableCell className="max-w-[16rem]">
                          <div className="text-xs text-[#1a1a1a] font-medium truncate" title={dataset.name}>
                            {dataset.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="px-1.5 py-0.5 text-xs rounded bg-[#f0f0f0] text-[#555555] capitalize">
                            {dataset.type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-[#fb923c]">{dataset.daysSinceLastAccess} days</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-[#ef4444]" />
              Failed Transformations
            </CardTitle>
            <p className="text-sm text-[#aaaaaa]">Transformations requiring attention</p>
          </CardHeader>
          <CardContent>
            {freshnessLoading ? (
              <div className="text-center text-[#aaaaaa] py-8">Loading...</div>
            ) : !dataFreshness?.failedTransformationsList || dataFreshness.failedTransformationsList.length === 0 ? (
              <div className="text-center text-[#4ade80] py-8 flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                All transformations running successfully
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transformation</TableHead>
                      <TableHead>Failures</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataFreshness.failedTransformationsList.map((transform: any) => (
                      <TableRow key={transform.id}>
                        <TableCell className="max-w-[12rem]">
                          <div className="text-xs text-[#1a1a1a] font-medium truncate" title={transform.name}>
                            {transform.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-[#ef4444]">
                            {transform.consecutiveFailures}x
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[16rem]">
                          <div className="text-xs text-[#aaaaaa] truncate" title={transform.errorMessage}>
                            {transform.errorMessage}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connection Health Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Health Matrix</CardTitle>
          <p className="text-sm text-[#aaaaaa]">Real-time status of all database connections</p>
        </CardHeader>
        <CardContent>
          {healthLoading ? (
            <div className="text-center text-[#aaaaaa] py-8">Loading...</div>
          ) : !connectionHealth?.connections || connectionHealth.connections.length === 0 ? (
            <div className="text-center text-[#aaaaaa] py-8">No connections found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Connection</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Queries (30d)</TableHead>
                    <TableHead>Errors</TableHead>
                    <TableHead>Last Used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connectionHealth.connections.map((conn: any) => (
                    <TableRow key={conn.id}>
                      <TableCell className="max-w-[12rem]">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-[#aaaaaa]" />
                          <div className="text-xs text-[#1a1a1a] font-medium truncate" title={conn.name}>
                            {conn.name}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-1.5 py-0.5 text-xs rounded bg-[#f0f0f0] text-[#555555] uppercase">
                          {conn.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ConnectionStatusBadge status={conn.status} />
                      </TableCell>
                      <TableCell className="text-sm">{conn.queryCount}</TableCell>
                      <TableCell>
                        <span
                          className={`text-sm font-medium ${
                            conn.recentErrors > 5
                              ? 'text-[#ef4444]'
                              : conn.recentErrors > 0
                              ? 'text-[#fb923c]'
                              : 'text-[#4ade80]'
                          }`}
                        >
                          {conn.recentErrors}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-[#aaaaaa]">
                        {conn.lastUsedAt ? new Date(conn.lastUsedAt).toLocaleString() : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Connection Status Badge Component
function ConnectionStatusBadge({ status }: { status: 'online' | 'offline' | 'error' | 'untested' }) {
  const statusConfig = {
    online: {
      label: 'Online',
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: 'bg-[#d1fae5] text-[#065f46] border-[#4ade80]',
    },
    offline: {
      label: 'Offline',
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-[#f0f0f0] text-[#555555] border-[#dddddd]',
    },
    error: {
      label: 'Error',
      icon: <AlertTriangle className="h-3 w-3" />,
      className: 'bg-[#fee2e2] text-[#991b1b] border-[#ef4444]',
    },
    untested: {
      label: 'Untested',
      icon: <Server className="h-3 w-3" />,
      className: 'bg-[#f0f0f0] text-[#aaaaaa] border-[#e8e8e8]',
    },
  };

  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}
