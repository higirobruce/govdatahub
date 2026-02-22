'use client';

import { usePathname } from 'next/navigation';
import './globals.css';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ToastProvider } from '@/components/ui/toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Sidebar } from '@/components/Sidebar';
import { MainContent } from '@/components/MainContent';
import { UserMenu } from '@/components/UserMenu';

// Metadata is added via the Metadata API in Next.js 14+
// Note: metadata exports can only be used in Server Components
// For client components, we handle this with a head element

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>DataGate - Multi-Database Integration Platform</title>
        <meta name="description" content="DataGate is a powerful data integration platform that connects to multiple databases (PostgreSQL, MySQL), enables SQL queries, cross-database joins, and provides data transformation pipelines." />
        <meta name="keywords" content="data integration, database management, SQL query, PostgreSQL, MySQL, cross-database joins, data transformation, ETL" />
        <meta name="author" content="DataGate" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="DataGate - Multi-Database Integration Platform" />
        <meta property="og:description" content="Connect, query, and transform data across multiple databases with DataGate's powerful integration platform." />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="DataGate - Multi-Database Integration Platform" />
        <meta name="twitter:description" content="Connect, query, and transform data across multiple databases with DataGate's powerful integration platform." />

        {/* Favicon */}
        <link rel="icon" type="image/svg+xml" href="/Coat_of_arms_of_Rwanda.svg" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body>
        <ToastProvider>
          <AuthProvider>
            <LayoutContent>{children}</LayoutContent>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
