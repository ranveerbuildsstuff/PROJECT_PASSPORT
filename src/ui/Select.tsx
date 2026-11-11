import React, { forwardRef, useId } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error,
    helperText,
    id: customId,
    className = '',
    required,
    options,
    children,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;

  const describedBy = error
    ? errorId
    : helperText
      ? helperId
      : undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-text-primary flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-color-danger ml-1" aria-hidden="true">*</span>}
          </span>
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border bg-bg-surface text-text-primary text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass cursor-pointer ${
          error
            ? 'border-color-danger focus-visible:ring-color-danger'
            : 'border-border-subtle hover:border-text-muted focus-visible:border-accent-brass'
        } ${className}`}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error && (
        <span id={errorId} role="alert" className="text-xs text-color-danger font-medium">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={helperId} className="text-xs text-text-muted">
          {helperText}
        </span>
      )}
    </div>
  );
});
