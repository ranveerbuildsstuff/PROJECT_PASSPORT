import React from 'react';

export type BadgeVariant = 'default' | 'brass' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({
  variant = 'default',
  className = '',
  children,
  ...props
}: BadgeProps) {
  const variantClasses = {
    default: 'border-border-subtle text-text-muted bg-bg-app/60',
    brass: 'border-accent-brass/80 text-accent-brass bg-accent-brass/10',
    success: 'border-color-success/80 text-color-success bg-color-success/10',
    warning: 'border-color-warning/80 text-color-warning bg-color-warning/10',
    danger: 'border-color-danger/80 text-color-danger bg-color-danger/10',
  }[variant];

  return (
    <span
      className={`font-mono text-xs tracking-wider px-2 py-0.5 rounded-sm border inline-flex items-center gap-1 font-medium select-none ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
