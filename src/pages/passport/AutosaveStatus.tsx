import React from 'react';
import { Check, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '../../ui';

export interface AutosaveStatusProps {
  saveStatus: 'saved' | 'saving' | 'not_saved' | 'error' | 'conflict';
  statusMessage?: string;
  className?: string;
  onRetry?: () => void;
  onReloadLatest?: () => void;
  onKeepMyVersion?: () => void;
}

export function AutosaveStatus({
  saveStatus,
  statusMessage,
  className = '',
  onRetry,
  onReloadLatest,
  onKeepMyVersion,
}: AutosaveStatusProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Autosave status"
      className={`text-xs font-mono font-medium ${className}`}
    >
      {saveStatus === 'saved' && (
        <span className="flex items-center gap-1.5 text-color-success">
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Saved</span>
        </span>
      )}

      {saveStatus === 'saving' && (
        <span className="flex items-center gap-1.5 text-accent-brass">
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>Saving...</span>
        </span>
      )}

      {saveStatus === 'not_saved' && (
        <span className="flex items-center gap-1.5 text-color-warning">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </span>
      )}

      {saveStatus === 'error' && (
        <div className="flex items-center flex-wrap gap-2 text-color-danger">
          <span className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{statusMessage || 'Failed to save changes.'}</span>
          </span>
          {onRetry && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry}
              className="text-xs"
            >
              Try again
            </Button>
          )}
        </div>
      )}

      {saveStatus === 'conflict' && (
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-color-warning/40 bg-color-warning/10 max-w-xl text-left font-sans">
          <div className="flex items-start gap-2 text-color-warning">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium leading-relaxed text-text-primary">
                {statusMessage ||
                  'This passport was changed somewhere else (another tab or a merge). Reload the latest version, or keep your version.'}
              </span>
              <span className="text-[11px] text-text-muted">
                Reloading will discard your unsaved edits here.
              </span>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2 pt-1 font-mono">
            {onReloadLatest && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onReloadLatest}
                className="text-xs"
              >
                Reload latest
              </Button>
            )}
            {onKeepMyVersion && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onKeepMyVersion}
                className="text-xs"
              >
                Keep my version
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
