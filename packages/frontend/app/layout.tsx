import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'DataGate - Multi-Database Integration Platform',
  description:
    'DataGate is a powerful data integration platform that connects to multiple databases (PostgreSQL, MySQL), enables SQL queries, cross-database joins, and provides data transformation pipelines.',
  keywords:
    'data integration, database management, SQL query, PostgreSQL, MySQL, cross-database joins, data transformation, ETL',
  authors: [{ name: 'DataGate' }],
  icons: { icon: '/Coat_of_arms_of_Rwanda.svg' },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    title: 'DataGate - Multi-Database Integration Platform',
    description:
      "Connect, query, and transform data across multiple databases with DataGate's powerful integration platform.",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DataGate - Multi-Database Integration Platform',
    description:
      "Connect, query, and transform data across multiple databases with DataGate's powerful integration platform.",
  },
};

function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/landing' || pathname.startsWith('/auth/');

  if (isAuthPage) {
    return <main>{children}</main>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-[#e8e8e8]">
      <Sidebar />
      <div className="flex-1 flex flex-col bg-white">
        <MainContent>{children}</MainContent>
      </div>
    </div>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPage = pathname === '/login' || pathname === '/register' || pathname === '/landing' || pathname.startsWith('/auth/');

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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
