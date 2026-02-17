'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { LogOut, User as UserIcon, Shield } from 'lucide-react';

export function UserMenu() {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  if (!isAuthenticated || !user) {
    return (
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => router.push('/login')}>
          Sign in
        </Button>
        <Button onClick={() => router.push('/register')}>Sign up</Button>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const getRoleBadgeColor = () => {
    switch (user.role) {
      case 'super_admin':
        return 'bg-destructive/10 text-destructive';
      case 'org_admin':
        return 'bg-primary/10 text-primary';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getRoleIcon = () => {
    if (user.role === 'super_admin' || user.role === 'org_admin') {
      return <Shield className="h-3 w-3" />;
    }
    return null;
  };

  return (
    <div className="flex items-center gap-3">
      <div className="hidden md:flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium leading-none">
              {user.firstName} {user.lastName}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">{user.email}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getRoleBadgeColor()}`}>
          {getRoleIcon()}
          <span>{user.role.replace('_', ' ').toUpperCase()}</span>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Logout</span>
      </Button>
    </div>
  );
}
