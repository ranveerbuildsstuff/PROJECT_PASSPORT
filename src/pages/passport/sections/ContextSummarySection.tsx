import React from 'react';
import { Files, MessageSquare, ArrowRight } from 'lucide-react';
import type { PassportV1 } from '../../../domain';
import { Card } from '../../../ui';

export interface ContextSummarySectionProps {
  passport: PassportV1;
  onNavigateTab: (tab: string) => void;
}

export function ContextSummarySection({
  passport,
  onNavigateTab,
}: ContextSummarySectionProps): React.ReactElement {
  const { files, conversations } = passport;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Files className="w-5 h-5 text-accent-brass" aria-hidden="true" />
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Source Files</h4>
              <span className="text-xs text-text-muted">
                {files.length} {files.length === 1 ? 'file' : 'files'} attached
              </span>
            </div>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Project source files and secret scanner findings are managed in the Files tab.
          </p>
          <button
            type="button"
            onClick={() => onNavigateTab('files')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-brass hover:underline min-h-[44px] cursor-pointer"
          >
            <span>Open Files tab</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </Card>

        <Card className="p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-accent-brass" aria-hidden="true" />
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Conversations</h4>
              <span className="text-xs text-text-muted">
                {conversations.length}{' '}
                {conversations.length === 1 ? 'conversation' : 'conversations'} attached
              </span>
            </div>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            AI conversations and turn transcripts are imported and curated in the Conversations tab.
          </p>
          <button
            type="button"
            onClick={() => onNavigateTab('conversations')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-brass hover:underline min-h-[44px] cursor-pointer"
          >
            <span>Open Conversations tab</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </Card>
      </div>
    </div>
  );
}
