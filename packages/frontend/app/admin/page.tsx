'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import { Building2, Users, ShieldCheck, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';

export default function AdminOverviewPage() {
  const { data: stats } = useSWR('admin/stats', () => api.admin.stats());

  const statCards = stats ? [
    { label: 'Total Organizations', value: stats.totalOrgs, icon: Building2, color: 'text-blue-600' },
    { label: 'Active Organizations', value: stats.activeOrgs, icon: Activity, color: 'text-green-600' },
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-indigo-600' },
  ] : [];

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold mb-1">Platform Overview</h1>
      <p className="text-sm text-gray-500 mb-8">System-wide statistics across all organizations</p>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {statCards.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-3xl font-bold mt-1">{s.value ?? '—'}</p>
              </div>
              <s.icon className={`w-8 h-8 ${s.color} opacity-60`} />
            </div>
          </Card>
        ))}
      </div>

      {stats?.usersByRole && (
        <Card className="p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            Users by Role
          </h2>
          <div className="space-y-2">
            {Object.entries(stats.usersByRole as Record<string, number>).map(([role, count]) => (
              <div key={role} className="flex items-center gap-3">
                <span className="text-sm w-36 text-gray-600 capitalize">{role.replace('_', ' ')}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (count / (stats.totalUsers || 1)) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-semibold w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
