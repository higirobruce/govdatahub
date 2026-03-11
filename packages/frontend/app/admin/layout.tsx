'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/types/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user?.role !== UserRole.SUPER_ADMIN) {
      router.replace('/');
    }
  }, [user, loading, router]);

  if (loading || user?.role !== UserRole.SUPER_ADMIN) {
    return null;
  }

  return <>{children}</>;
}