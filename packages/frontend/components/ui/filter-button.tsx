'use client';

import { cn } from '@/lib/utils';

interface FilterButtonProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export function FilterButton({
  children,
  icon,
  onClick,
  active = false,
  className,
}: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3.5 py-1.75 rounded-md border bg-white',
        'text-[13px] font-medium text-[#333333]',
        'transition-colors',
        active
          ? 'bg-[#f0f0f0] border-[#1a1a1a]'
          : 'border-[#dddddd] hover:bg-[#f8f8f8]',
        className
      )}
    >
      {icon && (
        <span className="w-3.5 h-3.5 flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:stroke-current [&>svg]:stroke-[1.7]">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
