import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Textarea } from './Textarea';
import { BookmarkPlus } from 'lucide-react';
import { createCheckpoint } from '../storage/storageService';
import { useToast } from './useToast';

export interface CreateCheckpointDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onCheckpointCreated?: (checkpointId: string) => void;
}

export function CreateCheckpointDialog({
  isOpen,
  onClose,
  projectId,
  onCheckpointCreated,
}: CreateCheckpointDialogProps): React.ReactElement {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const handleClose = () => {
    if (isSubmitting) return;
    setNote('');
    setError(null);
    onClose();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const checkpointId = await createCheckpoint(projectId, {
        note: note.trim() || undefined,
      });

      showToast('Checkpoint created.', 'success', 'Saved');
      handleClose();
      if (checkpointId && onCheckpointCreated) {
        onCheckpointCreated(checkpointId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create checkpoint.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Create checkpoint"
      description="Save a named snapshot of your project passport and attached files."
    >
      <form onSubmit={handleCreate} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 text-sm rounded-lg bg-color-danger/10 border border-color-danger/30 text-color-danger leading-relaxed"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="checkpoint-note"
            className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-1.5"
          >
            Checkpoint note (optional)
          </label>
          <Textarea
            id="checkpoint-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Before refactoring database schema, or Baseline after Slice 8"
            rows={3}
            maxLength={500}
            disabled={isSubmitting}
            autoFocus
          />
          <p className="text-xs text-text-muted mt-1.5 leading-normal">
            A brief note describing what changed or why you are creating this checkpoint.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            className="gap-2"
          >
            <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
            <span>Create checkpoint</span>
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
