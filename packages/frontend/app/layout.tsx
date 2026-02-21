'use client';

import { usePathname } from 'next/navigation';
import './globals.css';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Sidebar } from '@/components/Sidebar';
import { MainContent } from '@/components/MainContent';
import { UserMenu } from '@/components/UserMenu';

function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  // Auth pages - no sidebar
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
      <div className="flex-1 flex flex-col">
        {/* Optional: Add a top bar for user menu if needed */}
        <div className="flex justify-end items-center px-6 py-3">
          <UserMenu />
        </div>
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  return (
    <>
      {isAuthPage ? (
        <main>{children}</main>
      ) : (
        <ProtectedRoute>
          <AppLayout>{children}</AppLayout>
        </ProtectedRoute>
      )}
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <LayoutContent>{children}</LayoutContent>
        </AuthProvider>
      </body>
    </html>
  );
}
