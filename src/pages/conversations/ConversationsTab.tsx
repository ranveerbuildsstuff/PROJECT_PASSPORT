import React, { useState } from 'react';
import {
  type PassportV1,
  type ConversationRef,
} from '../../domain';
import { formatTokenEstimate } from '../../domain/tokens';
import {
  setConversationIncluded,
  removeConversation,
  restoreConversation,
  describeStorageError,
} from '../../storage';
import {
  Button,
  Card,
  Badge,
  CompactEmptyState,
  PasteConversationDialog,
  ReconstructPromptDialog,
  EditConversationDialog,
  useToast,
} from '../../ui';
import {
  Plus,
  Sparkles,
  Trash2,
  Edit3,
  MessageSquare,
  AlertCircle,
  Check,
} from 'lucide-react';

export interface ConversationsTabProps {
  projectId: string;
  passport: PassportV1;
}

export function ConversationsTab({
  projectId,
  passport,
}: ConversationsTabProps): React.ReactElement {
  const { showToast } = useToast();

  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [isReconstructOpen, setIsReconstructOpen] = useState(false);
  const [editingRef, setEditingRef] = useState<ConversationRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const conversations = passport.conversations || [];

  const handleToggleIncluded = async (conv: ConversationRef) => {
    setError(null);
    try {
      await setConversationIncluded(conv.id, !conv.included);
    } catch (err) {
      setError(describeStorageError(err));
    }
  };

  const handleRemove = async (conv: ConversationRef) => {
    setError(null);
    try {
      const result = await removeConversation(conv.id);
      if (result) {
        showToast(
          `Removed "${conv.title}".`,
          'info',
          undefined,
          {
            label: 'Undo',
            onClick: async () => {
              try {
                await restoreConversation(result.conversation, result.ref);
                showToast(`Restored "${conv.title}".`, 'success');
              } catch (restoreErr) {
                showToast(describeStorageError(restoreErr), 'error');
              }
            },
          }
        );
      }
    } catch (err) {
      setError(describeStorageError(err));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Tab toolbar: secondary actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Conversations</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Attach AI chat transcripts to preserve decisions, rationale, and project history.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsReconstructOpen(true)}
            disabled={conversations.length === 0}
            className="min-h-[44px] gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-accent-brass" aria-hidden="true" />
            <span>Reconstruct passport</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setIsPasteOpen(true)}
            className="min-h-[44px] gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Paste conversation</span>
          </Button>
        </div>
      </div>

      {/* Storage error banner if any */}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-color-danger bg-color-danger/10 text-text-primary flex items-start gap-2.5 text-sm"
        >
          <AlertCircle className="w-5 h-5 text-color-danger shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-text-muted leading-relaxed">{error}</p>
        </div>
      )}

      {/* Conversations list or compact empty state */}
      {conversations.length === 0 ? (
        <div className="py-4">
          <CompactEmptyState
            message="No conversations attached yet."
            actionLabel="Paste conversation"
            onAction={() => setIsPasteOpen(true)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3" role="list" aria-label="Attached conversations">
          {conversations.map((conv) => {
            return (
              <Card
                key={conv.id}
                role="listitem"
                aria-label={conv.title}
                className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors"
              >
                {/* Left: Info, stamp badge, tokens */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded bg-bg-app border border-border-subtle flex items-center justify-center text-text-muted shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4" aria-hidden="true" />
                  </div>

                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text-primary text-sm truncate">
                        {conv.title}
                      </span>
                      <Badge variant="default">
                        {conv.source.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-text-muted flex-wrap">
                      <span>
                        {conv.messageCount} {conv.messageCount === 1 ? 'message' : 'messages'}
                      </span>
                      <span>•</span>
                      <span className="font-mono">
                        {formatTokenEstimate(conv.tokenEstimate)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Include toggle, view/edit, remove */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border-subtle/50 shrink-0">
                  {/* Include toggle (min 44px target) */}
                  <label
                    htmlFor={`include-toggle-${conv.id}`}
                    className="flex items-center gap-2 text-xs text-text-primary cursor-pointer select-none min-h-[44px] min-w-[44px] px-2 py-1 rounded hover:bg-bg-app/50"
                  >
                    <input
                      id={`include-toggle-${conv.id}`}
                      type="checkbox"
                      checked={conv.included}
                      onChange={() => handleToggleIncluded(conv)}
                      aria-label={`Include ${conv.title} in export and reconstruct`}
                      className="sr-only peer"
                    />
                    <div className="w-5 h-5 rounded border border-border-subtle bg-bg-app flex items-center justify-center peer-checked:bg-accent-brass peer-checked:border-accent-brass text-accent-brass-contrast peer-focus-visible:ring-2 peer-focus-visible:ring-accent-brass">
                      {conv.included && <Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />}
                    </div>
                    <span className="text-xs font-medium">Include</span>
                  </label>

                  {/* View/Edit button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingRef(conv)}
                    aria-label={`View/edit ${conv.title}`}
                    className="min-h-[44px] min-w-[44px] gap-1.5 text-xs text-text-muted hover:text-text-primary"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>View/edit</span>
                  </Button>

                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(conv)}
                    aria-label={`Remove ${conv.title}`}
                    className="min-h-[44px] min-w-[44px] gap-1.5 text-xs text-text-muted hover:text-color-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Remove</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Paste Dialog */}
      <PasteConversationDialog
        isOpen={isPasteOpen}
        onClose={() => setIsPasteOpen(false)}
        projectId={projectId}
      />

      {/* Reconstruct Prompt Dialog */}
      <ReconstructPromptDialog
        isOpen={isReconstructOpen}
        onClose={() => setIsReconstructOpen(false)}
        passport={passport}
      />

      {/* View/Edit Conversation Dialog */}
      <EditConversationDialog
        isOpen={editingRef !== null}
        onClose={() => setEditingRef(null)}
        conversationRef={editingRef}
      />
    </div>
  );
}
