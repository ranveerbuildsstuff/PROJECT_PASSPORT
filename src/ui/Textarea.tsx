import React, { forwardRef, useId, useRef, useEffect, useCallback } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  isMonospace?: boolean;
  autoGrow?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    error,
    helperText,
    isMonospace = false,
    autoGrow = true,
    id: customId,
    className = '',
    required,
    rows = 1,
    onChange,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const textareaId = customId || generatedId;
  const errorId = `${textareaId}-error`;
  const helperId = `${textareaId}-helper`;

  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      }
    },
    [ref]
  );

  const adjustHeight = useCallback(() => {
    const el = internalRef.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    const computed = window.getComputedStyle(el);
    const borderTop = parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = parseFloat(computed.borderBottomWidth) || 0;
    const targetHeight = Math.max(44, el.scrollHeight + borderTop + borderBottom);
    el.style.height = `${targetHeight}px`;
  }, [autoGrow]);

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight, props.value]);

  useEffect(() => {
    if (!autoGrow) return;
    window.addEventListener('resize', adjustHeight);
    return () => window.removeEventListener('resize', adjustHeight);
  }, [adjustHeight, autoGrow]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (autoGrow) {
      adjustHeight();
    }
    onChange?.(e);
  };

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
        ref={setRef}
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        onChange={handleChange}
        className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-lg border bg-bg-surface text-text-primary text-sm transition-colors placeholder:text-text-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass break-words ${
          autoGrow ? 'resize-none overflow-hidden' : 'resize-y'
        } ${
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
