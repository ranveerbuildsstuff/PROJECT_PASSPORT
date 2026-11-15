import React, { useState, useEffect } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { ConversationViewer } from './ConversationViewer';
import { type ConversationTurn, type ConversationRef } from '../domain';
import {
  getConversation,
  recordToTurns,
  updateConversationTurns,
  describeStorageError,
} from '../storage';
import { useToast } from './useToast';
import { AlertCircle } from 'lucide-react';

export interface EditConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  conversationRef: ConversationRef | null;
  onSuccess?: () => void;
}

export function EditConversationDialog({
  isOpen,
  onClose,
  conversationRef,
  onSuccess,
}: EditConversationDialogProps): React.ReactElement {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !conversationRef) {
      setTitle('');
      setTurns([]);
      setError(null);
      return;
    }

    setTitle(conversationRef.title);
    let isMounted = true;

    async function load() {
      if (!conversationRef) return;
      setIsLoading(true);
      setError(null);
      try {
        const record = await getConversation(conversationRef.id);
        if (isMounted) {
          if (record) {
            setTurns(recordToTurns(record));
          } else {
            setError('Conversation not found in local storage.');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(describeStorageError(err));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [isOpen, conversationRef]);

  const handleSave = async () => {
    if (!conversationRef) return;
    setIsSaving(true);
    setError(null);

    const finalTitle = title.trim() || conversationRef.title;

    try {
      await updateConversationTurns(conversationRef.id, turns, {
        title: finalTitle,
      });

      showToast(`Saved changes to "${finalTitle}".`, 'success');
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(describeStorageError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="View and edit conversation"
      description="Inspect or update speaker roles, boundaries, and content for this conversation."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-color-danger bg-color-danger/10 text-text-primary flex items-start gap-2.5 text-sm"
          >
            <AlertCircle className="w-5 h-5 text-color-danger shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-text-muted leading-relaxed">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-subtle border-t-accent-brass" />
            <span className="text-sm">Loading conversation...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Title field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="edit-conversation-title"
                className="text-xs font-semibold text-text-primary uppercase tracking-wider"
              >
                Conversation Title
              </label>
              <input
                id="edit-conversation-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Conversation title"
                className="w-full text-sm font-sans text-text-primary bg-bg-app border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-brass"
              />
            </div>

            {/* Viewer */}
            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <ConversationViewer
                turns={turns}
                onChange={setTurns}
              />
            </div>

            {/* Actions: Single brass primary */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-subtle/60 flex-wrap">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || turns.length === 0}
                className="min-h-[44px]"
              >
                {isSaving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
