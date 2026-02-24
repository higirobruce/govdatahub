'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import {
  Database,
  Activity,
  Server,
  AlertTriangle,
  GitBranch,
  BarChart3,
  FolderKanban,
  Library,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CatalogTab } from '@/components/dashboard/CatalogTab';
import { AnalyticsTab } from '@/components/dashboard/AnalyticsTab';
import { CatalogIntegrationTab } from '@/components/dashboard/CatalogIntegrationTab';

interface DashboardStats {
  totalDatasets: number;
  activeConnections: number;
  queriesToday: number;
  activeApiEndpoints: number;
  failedJobs: number;
  totalTransformations: number;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('catalog');

  const { data: stats, isLoading: statsLoading } = useSWR<DashboardStats>(
    '/dashboard/stats',
    () => api.dashboard.getStats()
  );

  // Keyboard shortcuts: Alt+1 Catalog, Alt+2 Analytics, Alt+3 OM Integration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === '1') { e.preventDefault(); setActiveTab('catalog'); }
      if (e.altKey && e.key === '2') { e.preventDefault(); setActiveTab('analytics'); }
      if (e.altKey && e.key === '3') { e.preventDefault(); setActiveTab('om-catalog'); }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="w-full">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your datasets, analytics, and platform health"
      />

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        <StatCard
          name="Total Datasets"
          subtitle="Across all sources"
          value={statsLoading ? '...' : String(stats?.totalDatasets || 0)}
          icon={Database}
          iconColor="blue"
        />
        <StatCard
          name="Active Connections"
          subtitle="Database connections"
          value={statsLoading ? '...' : String(stats?.activeConnections || 0)}
          icon={Database}
          iconColor="green"
        />
        <StatCard
          name="Queries Today"
          subtitle="Executed queries"
          value={statsLoading ? '...' : String(stats?.queriesToday || 0)}
          icon={Activity}
          iconColor="blue"
        />
        <StatCard
          name="API Endpoints"
          subtitle="Active endpoints"
          value={statsLoading ? '...' : String(stats?.activeApiEndpoints || 0)}
          icon={Server}
          iconColor="green"
        />
        <StatCard
          name="Failed Jobs"
          subtitle="Requires attention"
          value={statsLoading ? '...' : String(stats?.failedJobs || 0)}
          icon={AlertTriangle}
          iconColor={stats?.failedJobs && stats.failedJobs > 0 ? 'orange' : 'gray'}
        />
        <StatCard
          name="Transformations"
          subtitle="Active pipelines"
          value={statsLoading ? '...' : String(stats?.totalTransformations || 0)}
          icon={GitBranch}
          iconColor="orange"
        />
      </div>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="catalog" className="gap-2">
            <FolderKanban className="h-4 w-4" />
            <span>Data Catalog</span>
            <span className="text-[11px] text-[#aaaaaa] ml-1">(Alt+1)</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Analytics</span>
            <span className="text-[11px] text-[#aaaaaa] ml-1">(Alt+2)</span>
          </TabsTrigger>
          <TabsTrigger value="om-catalog" className="gap-2">
            <Library className="h-4 w-4" />
            <span>OM Integration</span>
            <span className="text-[11px] text-[#aaaaaa] ml-1">(Alt+3)</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsTab />
        </TabsContent>

        <TabsContent value="om-catalog">
          <CatalogIntegrationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
