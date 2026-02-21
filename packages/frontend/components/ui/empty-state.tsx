import { LucideIcon } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-[#f8f8f8] p-3 mb-4">
        <Icon className="h-6 w-6 text-[#aaaaaa]" />
      </div>
      <h3 className="text-sm font-medium text-[#1a1a1a] mb-1">
        {title}
      </h3>
      <p className="text-sm text-[#aaaaaa] max-w-sm mb-4">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
