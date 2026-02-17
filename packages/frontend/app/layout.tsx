'use client';

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import './globals.css'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { UserMenu } from '@/components/UserMenu'

function Navigation() {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();

  // Don't show navigation if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container mx-auto">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">GD</span>
              </div>
              <span className="text-lg font-semibold">GovDataHub</span>
            </Link>

            <nav className="flex items-center space-x-1">
              <Link
                href="/"
                className={`px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  isActive('/')
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/connections"
                className={`px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  isActive('/connections')
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Connections
              </Link>
              <Link
                href="/query"
                className={`px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  isActive('/query')
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Query
              </Link>
              <Link
                href="/catalog"
                className={`px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  isActive('/catalog')
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Catalog
              </Link>
              <Link
                href="/cross-query"
                className={`px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                  isActive('/cross-query')
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                Cross-Query
              </Link>
            </nav>
          </div>

          <UserMenu />
        </div>
      </div>
    </nav>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      {isAuthPage ? (
        <main>{children}</main>
      ) : (
        <ProtectedRoute>
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </ProtectedRoute>
      )}
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <LayoutContent>{children}</LayoutContent>
        </AuthProvider>
      </body>
    </html>
  )
}
