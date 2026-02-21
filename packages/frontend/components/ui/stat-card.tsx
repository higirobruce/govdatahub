import { cn } from '@/lib/utils';

interface StatCardProps {
  name: string;
  subtitle: string;
  value: string | number;
  valueSubtext?: string;
  progressPercent?: number;
  progressColor?: 'green' | 'orange' | 'blue';
  className?: string;
}

export function StatCard({
  name,
  subtitle,
  value,
  valueSubtext,
  progressPercent,
  progressColor = 'green',
  className,
}: StatCardProps) {
  const colorMap = {
    green: '#4ade80',
    orange: '#fb923c',
    blue: '#60a5fa',
  };

  return (
    <div
      className={cn(
        'bg-white rounded-xl p-6 border border-[#e8e8e8]',
        className
      )}
    >
      <div className="font-semibold text-[13px] text-[#1a1a1a] mb-0.5">
        {name}
      </div>
      <div className="text-xs text-[#aaaaaa] mb-4">{subtitle}</div>
      <div className="text-[26px] font-bold mb-3">
        {value}
        {valueSubtext && (
          <span className="text-lg font-normal text-[#aaaaaa] ml-1">
            {valueSubtext}
          </span>
        )}
      </div>
      {progressPercent !== undefined && (
        <ProgressBar
          percent={progressPercent}
          color={colorMap[progressColor]}
        />
      )}
    </div>
  );
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const segments = 36;
  const filled = Math.round(percent * segments);

  return (
    <div className="flex gap-0.5 flex-nowrap overflow-hidden">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="h-[5px] rounded-sm flex-shrink-0"
          style={{
            width: '6px',
            backgroundColor: i < filled ? color : '#e0e0e0',
          }}
        />
      ))}
    </div>
  );
}
