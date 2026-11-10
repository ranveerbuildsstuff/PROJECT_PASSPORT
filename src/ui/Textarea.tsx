import React, { forwardRef, useId } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  isMonospace?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    error,
    helperText,
    isMonospace = false,
    id: customId,
    className = '',
    required,
    rows = 3,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const textareaId = customId || generatedId;
  const errorId = `${textareaId}-error`;
  const helperId = `${textareaId}-helper`;

  const describedBy = error
    ? errorId
    : helperText
      ? helperId
      : undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label
          htmlFor={textareaId}
          className="text-sm font-medium text-text-primary flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-color-danger ml-1" aria-hidden="true">*</span>}
          </span>
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={`w-full min-h-[88px] px-3.5 py-2.5 rounded-lg border bg-bg-surface text-text-primary text-sm transition-colors placeholder:text-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass resize-y ${
          isMonospace ? 'font-mono' : 'font-sans'
        } ${
          error
            ? 'border-color-danger focus-visible:ring-color-danger'
            : 'border-border-subtle hover:border-text-muted focus-visible:border-accent-brass'
        } ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-color-danger font-medium mt-0.5">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={helperId} className="text-xs text-text-muted mt-0.5">
          {helperText}
        </p>
      )}
    </div>
  );
});
