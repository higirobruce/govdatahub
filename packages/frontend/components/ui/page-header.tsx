import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-4xl font-bold text-[#1a1a1a]">{title}</h1>
          {subtitle && (
            <p className="text-md text-[#aaaaaa] mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex gap-2.5">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
