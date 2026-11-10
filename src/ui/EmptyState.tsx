import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-border-subtle rounded-lg bg-bg-surface/30 max-w-xl mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-bg-surface border border-border-subtle flex items-center justify-center text-accent-brass mb-4">
        {icon}
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-text-primary mb-2">
        {title}
      </h3>
      <p className="text-sm text-text-muted leading-relaxed max-w-md mb-6">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
