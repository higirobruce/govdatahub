'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/types/auth';
import { Building2, LayoutDashboard, ShieldAlert } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role !== UserRole.SUPER_ADMIN) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || user?.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gray-950 text-gray-100">
      {/* Admin sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <span className="font-semibold text-sm">Platform Admin</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Super admin console</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <Link
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </Link>
          <Link
            href="/admin/organizations"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Building2 className="w-4 h-4" />
            Organizations
          </Link>
        </nav>

        <div className="p-3 border-t border-gray-800">
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ← Back to app
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 text-gray-900">
        {children}
      </main>
    </div>
  );
}
