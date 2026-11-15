import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Badge } from './Badge';
import { RotateCcw, AlertTriangle, Info } from 'lucide-react';
import type { CheckpointRecord } from '../storage/db';
import type { PassportV1 } from '../domain/passport.schema';
import { checkpointKind } from '../domain/checkpoint';
import { diffPassports } from '../domain/diff';
import { restoreCheckpoint, listCheckpoints } from '../storage/storageService';
import { flushActiveAutosave } from '../lib';
import { useToast } from './useToast';

export interface RestoreCheckpointDialogProps {
  isOpen: boolean;
  onClose: () => void;
  checkpoint: CheckpointRecord | null;
  sequenceNumber: number;
  currentPassport: PassportV1 | null;
  onRestored?: (restoredPassport: PassportV1) => void;
}

export function RestoreCheckpointDialog({
  isOpen,
  onClose,
  checkpoint,
  sequenceNumber,
  currentPassport,
  onRestored,
}: RestoreCheckpointDialogProps): React.ReactElement {
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  if (!checkpoint) {
    return <></>;
  }

  const kind = checkpointKind(checkpoint);
  const cpPassport = checkpoint.passport;

  // Calculate preview diff between current and checkpoint
  const diff = currentPassport && cpPassport
    ? diffPassports(currentPassport, cpPassport)
    : null;

  const handleClose = () => {
    if (isRestoring) return;
    setError(null);
    onClose();
  };

  const handleConfirmRestore = async () => {
    if (isRestoring || !checkpoint) return;

    setIsRestoring(true);
    setError(null);

    try {
      // Step 1: Flush any pending debounced autosave edits
      await flushActiveAutosave();

      // Step 2: Restore editor fields (creates automatic "Before restore" checkpoint atomically)
      const restored = await restoreCheckpoint(checkpoint.id, {
        expectedUpdatedAt: currentPassport?.project.updatedAt,
      });

      // Step 3: Trigger toast with Undo action
      showToast(
        `Restored checkpoint #${sequenceNumber}.`,
        'success',
        'Checkpoint Restored',
        {
          label: 'Undo',
          onClick: async () => {
            try {
              const list = await listCheckpoints(checkpoint.projectId);
              const beforeRestoreCp = list.find((c) => c.type === 'before_restore' || c.description === 'Before restore');
              if (beforeRestoreCp) {
                await flushActiveAutosave();
                const unDone = await restoreCheckpoint(beforeRestoreCp.id);
                showToast('Undone restore.', 'info', 'Restored previous state');
                if (onRestored) onRestored(unDone);
              }
            } catch {
              showToast('Could not undo restore.', 'error', 'Undo Failed');
            }
          },
        }
      );

      handleClose();
      if (onRestored) {
        onRestored(restored);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restore checkpoint.';
      setError(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={`Restore checkpoint #${sequenceNumber}`}
      description={`Created as ${kind} on ${new Date(checkpoint.createdAt).toLocaleString()}`}
    >
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 text-sm rounded-lg bg-color-danger/10 border border-color-danger/30 text-color-danger leading-relaxed"
          >
            {error}
          </div>
        )}

        {/* Restore Scope / Attachment Notice Banner */}
        <div className="p-3.5 rounded-lg border border-accent-brass/40 bg-accent-brass/10 flex items-start gap-3">
          <Info className="w-5 h-5 text-accent-brass shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-text-primary leading-relaxed space-y-1">
            <p className="font-semibold text-text-primary">
              Your attached files and conversations stay as they are.
            </p>
            <p className="text-text-muted">
              Restoring this checkpoint replaces only the passport editor fields (goals, stack, tasks, requirements, decisions, bugs, etc.). Files and conversations attached to your project are never removed or deleted.
            </p>
          </div>
        </div>

        {/* Automatic Safety Checkpoint Notice */}
        <div className="p-3 rounded-lg border border-border-subtle bg-bg-surface flex items-start gap-2.5 text-xs text-text-muted">
          <AlertTriangle className="w-4 h-4 text-color-warning shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            An automated <strong>Before restore</strong> checkpoint will be taken immediately before restoring so you can always undo.
          </span>
        </div>

        {/* Checkpoint Details & Diff Summary */}
        <div className="rounded-lg border border-border-subtle p-3.5 space-y-2 bg-bg-surface">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-text-muted">Target version:</span>
            <Badge variant="brass">#{sequenceNumber} • {kind.toUpperCase()}</Badge>
          </div>
          {checkpoint.note && (
            <div className="text-xs text-text-primary bg-bg-app p-2.5 rounded border border-border-subtle">
              <span className="text-text-muted font-medium block mb-0.5">Note:</span>
              <p className="italic">{checkpoint.note}</p>
            </div>
          )}
          <div className="text-xs text-text-muted pt-1">
            {diff && diff.hasChanges ? (
              <span>
                Restoring will apply changes to your current passport (
                <strong className="text-text-primary">{diff.summary}</strong>).
              </span>
            ) : (
              <span>This checkpoint is identical to your current passport state.</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isRestoring}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirmRestore}
            isLoading={isRestoring}
            className="gap-2"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>Restore checkpoint</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
