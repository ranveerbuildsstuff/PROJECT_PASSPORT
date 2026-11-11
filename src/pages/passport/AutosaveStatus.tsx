import React from 'react';
import { Check, Loader2, AlertTriangle, AlertCircle } from 'lucide-react';

export interface AutosaveStatusProps {
  saveStatus: 'saved' | 'saving' | 'not_saved' | 'error';
  statusMessage?: string;
  className?: string;
}

export function AutosaveStatus({
  saveStatus,
  statusMessage,
  className = '',
}: AutosaveStatusProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Autosave status"
      className={`flex items-center gap-2 text-xs font-mono font-medium ${className}`}
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
        <span className="flex items-center gap-1.5 text-color-danger">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </span>
      )}
    </div>
  );
}
