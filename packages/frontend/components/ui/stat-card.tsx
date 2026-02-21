import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  name: string;
  subtitle: string;
  value: string | number;
  valueSubtext?: string;
  icon?: LucideIcon;
  iconColor?: 'green' | 'orange' | 'blue' | 'gray' | 'red';
  className?: string;
  progressPercent?: number;
  progressColor?: 'green' | 'orange' | 'blue' | 'red';
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
}

export function StatCard({
  name,
  subtitle,
  value,
  valueSubtext,
  icon: Icon,
  iconColor = 'gray',
  className,
  progressPercent,
  progressColor = 'blue',
  trend,
  trendDirection = 'neutral',
}: StatCardProps) {
  const iconColorMap = {
    green: 'text-[#4ade80] bg-[#f0fdf4]',
    orange: 'text-[#fb923c] bg-[#fff7ed]',
    blue: 'text-[#60a5fa] bg-[#eff6ff]',
    gray: 'text-[#aaaaaa] bg-[#f8f8f8]',
    red: 'text-[#ef4444] bg-[#fef2f2]',
  };

  const progressColorMap = {
    green: '#4ade80',
    orange: '#fb923c',
    blue: '#60a5fa',
    red: '#ef4444',
  };

  const trendColorMap = {
    up: 'text-[#4ade80]',
    down: 'text-[#ef4444]',
    neutral: 'text-[#aaaaaa]',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-xl p-4 border border-[#e8e8e8]',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="font-semibold text-[11px] text-[#1a1a1a] mb-0.5">
            {name}
          </div>
          <div className="text-[10px] text-[#aaaaaa]">{subtitle}</div>
        </div>
        {Icon && (
          <div className={cn('rounded-md p-1.5', iconColorMap[iconColor])}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-[20px] font-bold">
          {value}
          {valueSubtext && (
            <span className="text-sm font-normal text-[#aaaaaa] ml-1">
              {valueSubtext}
            </span>
          )}
        </div>
        {trend && (
          <div className={cn('text-xs font-medium flex items-center gap-0.5', trendColorMap[trendDirection])}>
            {trendDirection === 'up' && <TrendingUp className="h-3 w-3" />}
            {trendDirection === 'down' && <TrendingDown className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </div>

      {/* Segmented Progress Bar (from temp.html design) */}
      {progressPercent !== undefined && (
        <div className="mt-3">
          <div className="flex gap-0.5">
            {Array.from({ length: 36 }).map((_, index) => {
              const segmentPercent = (index + 1) / 36 * 100;
              const isActive = segmentPercent <= progressPercent;
              return (
                <div
                  key={index}
                  className="h-1.5 rounded-[1px] flex-1"
                  style={{
                    backgroundColor: isActive ? progressColorMap[progressColor] : '#e8e8e8',
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
