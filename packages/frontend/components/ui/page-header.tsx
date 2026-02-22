import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  iconGradient?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  className,
  icon: Icon,
  iconGradient = 'from-blue-500 to-purple-600',
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`w-10 h-10 bg-gradient-to-br ${iconGradient} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-4xl font-bold text-[#1a1a1a]">{title}</h1>
            {subtitle && (
              <p className="text-md text-[#aaaaaa] mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2.5">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
