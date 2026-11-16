import React, { useState, useCallback, useId } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ToastContext, type ToastMessage, type ToastType } from './useToast';

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const idPrefix = useId();

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = 'info',
      title?: string,
      action?: { label: string; onClick: () => void },
      duration = 4000
    ) => {
      const id = `${idPrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastMessage = { id, type, title, message, action, duration };
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [idPrefix, removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-lg bg-bg-surface border-border-subtle text-text-primary text-sm animate-in fade-in slide-in-from-bottom-2"
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-color-success" aria-hidden="true" />
              )}
              {t.type === 'warning' && (
                <AlertTriangle className="w-4 h-4 text-color-warning" aria-hidden="true" />
              )}
              {t.type === 'error' && (
                <AlertCircle className="w-4 h-4 text-color-danger" aria-hidden="true" />
              )}
              {t.type === 'info' && (
                <Info className="w-4 h-4 text-accent-brass" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1 flex flex-col gap-0.5">
              {t.title && <span className="font-semibold text-xs uppercase tracking-wider">{t.title}</span>}
              <span className="text-sm leading-snug">{t.message}</span>
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  removeToast(t.id);
                }}
                className="shrink-0 inline-flex items-center justify-center min-h-[44px] px-2 text-xs font-semibold text-accent-brass hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass rounded"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded text-text-muted hover:text-text-primary hover:bg-bg-app transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
