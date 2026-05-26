'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardGrid } from '@/components/DashboardBuilder/DashboardGrid';
import { api } from '@/lib/api';

interface PublicDashboardPageProps {
  params: { token: string };
}

export default function PublicDashboardPage({ params }: PublicDashboardPageProps) {
  const { token } = params;
  const [dashboard, setDashboard] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const data = await api.publicDashboards.get(token);
        setDashboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Dashboard not found or link expired');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
        <div className="w-10 h-10 border-4 border-[#e8e8e8] border-t-[#60a5fa] rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
        <div className="text-center">
          <p className="text-[#555555] text-lg mb-4">
            This dashboard link is invalid or has expired.
          </p>
          <Link href="/" className="text-[#60a5fa] hover:underline text-sm">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Header bar */}
      <div className="bg-white border-b border-[#e8e8e8] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1a1a1a]">{dashboard.name}</h1>
          {dashboard.description && (
            <p className="text-sm text-[#555555]">{dashboard.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-[#aaaaaa]">
          <span>Powered by</span>
          <span className="font-semibold text-[#1a1a1a]">DataGate</span>
        </div>
      </div>

      {/* Dashboard content */}
      <div className="p-6">
        <DashboardGrid
          widgets={dashboard.widgets}
          layout={dashboard.layout}
          onLayoutChange={() => {}}
          onSelectWidget={() => {}}
          onDeleteWidget={() => {}}
          isPreviewMode={true}
        />
      </div>

      {/* Footer */}
      <div className="text-center py-6 text-xs text-[#aaaaaa]">
        Read-only view • {new Date(dashboard.createdAt).toLocaleDateString()}
      </div>
    </div>
  );
}
