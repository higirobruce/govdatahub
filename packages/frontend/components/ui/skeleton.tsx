import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-[#f0f0f0]',
        className
      )}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#e8e8e8] shadow-card p-6">
      <Skeleton className="h-4 w-3/4 mb-2" />
      <Skeleton className="h-3 w-1/2 mb-4" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="border-b border-[#f0f0f0]">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#e8e8e8] p-6">
      <Skeleton className="h-3 w-24 mb-1" />
      <Skeleton className="h-2 w-16 mb-3" />
      <Skeleton className="h-8 w-20 mb-3" />
      <Skeleton className="h-1 w-full" />
    </div>
  );
}
