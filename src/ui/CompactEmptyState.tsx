import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from './Button';

export interface CompactEmptyStateProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  className?: string;
}

export function CompactEmptyState({
  message,
  actionLabel,
  onAction,
  className = '',
}: CompactEmptyStateProps): React.ReactElement {
  return (
    <div
      className={`flex items-center justify-between py-2 px-3.5 rounded-lg border border-border-subtle bg-bg-app text-xs text-text-muted gap-3 ${className}`}
    >
      <span>{message}</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onAction}
        className="gap-1.5 shrink-0"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{actionLabel}</span>
      </Button>
    </div>
  );
}
