'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Sidebar } from '@/components/Sidebar';
import { MainContent } from '@/components/MainContent';

function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/landing';

  // Auth pages and landing page - no sidebar
  if (isAuthPage) {
    return <main>{children}</main>;
  }

  // Authenticated pages - sidebar layout
  if (!isAuthenticated) {
    return null; // ProtectedRoute will redirect
  }

  return (
    <div className="flex min-h-screen bg-[#e8e8e8]">
      <Sidebar />
      <div className="flex-1 flex flex-col bg-white">
        {/* Optional: Add a top bar for user menu if needed */}
        {/* <div className="flex justify-end items-center px-6 py-3">
          <UserMenu />
        </div> */}
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = pathname === '/login' || pathname === '/register' || pathname === '/landing';

  return (
    <>
      {isPublicPage ? (
        <main>{children}</main>
      ) : (
        <ProtectedRoute>
          <AppLayout>{children}</AppLayout>
        </ProtectedRoute>
      )}
    </>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <LayoutContent>{children}</LayoutContent>
      </AuthProvider>
    </ToastProvider>
  );
}
