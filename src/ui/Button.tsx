import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    isLoading = false,
    disabled = false,
    className = '',
    children,
    type = 'button',
    ...props
  },
  ref
) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer select-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass focus-visible:ring-offset-1 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ' +
    // Guarantee touch target of at least 44x44px per AGENTS.md invariant 9
    'min-h-[44px] min-w-[44px]';

  const sizeClasses = {
    sm: 'text-xs px-3 py-2 gap-1.5',
    md: 'text-sm px-4 py-2.5 gap-2',
    lg: 'text-base px-6 py-3 gap-2.5',
  }[size];

  const variantClasses = {
    primary:
      'bg-accent-brass text-accent-brass-contrast font-semibold hover:brightness-110 active:brightness-95 border border-accent-brass',
    secondary:
      'bg-bg-surface text-text-primary border border-border-subtle hover:border-text-muted active:bg-bg-app',
    outline:
      'bg-transparent text-text-primary border border-border-subtle hover:border-text-muted hover:bg-bg-surface/50 active:bg-bg-surface',
    ghost:
      'bg-transparent text-text-primary hover:bg-bg-surface active:bg-bg-surface/80',
    danger:
      'bg-color-danger text-white hover:brightness-110 active:brightness-95 border border-color-danger',
  }[variant];

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
});
