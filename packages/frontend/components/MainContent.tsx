'use client';

import { cn } from '@/lib/utils';

interface MainContentProps {
  children: React.ReactNode;
  className?: string;
}

export function MainContent({ children, className }: MainContentProps) {
  return (
    <main
      className={cn(
        'flex-1 bg-[#f2f2f2] rounded-2xl overflow-y-auto shadow-subtle',
        // Responsive margins and padding
        'm-0 md:m-3 md:ml-0 rounded-none md:rounded-2xl',
        'p-4 md:p-8',
        // Account for mobile menu button
        'pt-16 md:pt-8',
        className
      )}
    >
      {children}
    </main>
  );
}
