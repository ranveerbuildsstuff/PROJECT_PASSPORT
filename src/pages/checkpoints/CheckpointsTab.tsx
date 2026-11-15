import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { CompactEmptyState } from '../../ui/CompactEmptyState';
import { CreateCheckpointDialog } from '../../ui/CreateCheckpointDialog';
import { RestoreCheckpointDialog } from '../../ui/RestoreCheckpointDialog';
import { CompareDialog } from '../../ui/CompareDialog';
import { Plus, History, RotateCcw, ArrowLeftRight, Clock, AlertCircle } from 'lucide-react';
import type { CheckpointRecord } from '../../storage/db';
import type { PassportV1 } from '../../domain/passport.schema';
import { checkpointKind, checkpointSequence, countActivePassportSections } from '../../domain/checkpoint';
import { listCheckpoints } from '../../storage/storageService';
import { formatDateTime } from '../../lib';

export interface CheckpointsTabProps {
  projectId: string;
  passport: PassportV1;
  onPassportUpdated?: (updated: PassportV1) => void;
}

export function CheckpointsTab({
  projectId,
  passport,
  onPassportUpdated,
}: CheckpointsTabProps): React.ReactElement {
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [comparingCheckpointId, setComparingCheckpointId] = useState<string | null>(null);
  const [restoringCheckpoint, setRestoringCheckpoint] = useState<CheckpointRecord | null>(null);

  const fetchCheckpoints = useCallback(async () => {
    try {
      setError(null);
      const list = await listCheckpoints(projectId);
      setCheckpoints(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load checkpoints.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCheckpoints();

    const handleStorageUpdate = () => {
      fetchCheckpoints();
    };

    window.addEventListener('project-storage-updated', handleStorageUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    return () => {
      window.removeEventListener('project-storage-updated', handleStorageUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [fetchCheckpoints]);

  const sequenceMap = useMemo(() => checkpointSequence(checkpoints), [checkpoints]);

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2">
            <History className="w-5 h-5 text-accent-brass" aria-hidden="true" />
            <span>Checkpoints</span>
          </h2>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Archival snapshots with file SHA-256 hashes, plain-language visual diffs, and safe rollback.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          className="gap-2 shrink-0 self-start sm:self-auto min-h-[44px]"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Create checkpoint</span>
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-color-danger/10 border border-color-danger/30 text-color-danger text-sm flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchCheckpoints()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="py-12 text-center text-sm text-text-muted" aria-live="polite">
          Loading checkpoints...
        </div>
      )}

      {/* Compact Empty state */}
      {!isLoading && !error && checkpoints.length === 0 && (
        <CompactEmptyState
          message="No checkpoints yet."
          actionLabel="Create checkpoint"
          onAction={() => setIsCreateOpen(true)}
        />
      )}

      {/* Populated Timeline List */}
      {!isLoading && !error && checkpoints.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-text-muted px-1">
            <span>{checkpoints.length} {checkpoints.length === 1 ? 'checkpoint' : 'checkpoints'} recorded</span>
            <span>Newest first</span>
          </div>

          <div className="space-y-3">
            {checkpoints.map((cp) => {
              const seq = sequenceMap.get(cp.id) ?? 1;
              const kind = checkpointKind(cp);
              const activeSections = cp.passport ? countActivePassportSections(cp.passport) : 0;
              const filesCount = cp.files ? cp.files.length : (cp.passport?.files?.length ?? 0);
              const convsCount = cp.conversationIds ? cp.conversationIds.length : (cp.passport?.conversations?.length ?? 0);

              const badgeVariant = kind === 'Before restore' ? 'warning' : kind === 'Before AI merge' ? 'default' : 'brass';

              return (
                <Card
                  key={cp.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-border-muted transition-colors"
                >
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* Stamp badge per DESIGN §5: compact uppercase badge with 4px corner radius */}
                      <Badge variant={badgeVariant}>
                        #{seq} • {kind.toUpperCase()}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-text-muted">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        {formatDateTime(cp.createdAt)}
                      </span>
                    </div>

                    {cp.note && (
                      <p className="text-sm text-text-primary font-medium break-words">
                        {cp.note}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
                      <span>{activeSections} active sections</span>
                      <span>•</span>
                      <span>{filesCount} {filesCount === 1 ? 'file' : 'files'}</span>
                      <span>•</span>
                      <span>{convsCount} {convsCount === 1 ? 'chat' : 'chats'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setComparingCheckpointId(cp.id)}
                      className="gap-1.5 min-h-[44px]"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Compare</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoringCheckpoint(cp)}
                      className="gap-1.5 min-h-[44px]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Restore</span>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <CreateCheckpointDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        projectId={projectId}
        onCheckpointCreated={() => fetchCheckpoints()}
      />

      {/* Compare Dialog */}
      <CompareDialog
        isOpen={Boolean(comparingCheckpointId)}
        onClose={() => setComparingCheckpointId(null)}
        checkpoints={checkpoints}
        currentPassport={passport}
        projectId={projectId}
        initialFromId={comparingCheckpointId || undefined}
        initialToId="current"
      />

      {/* Restore Dialog */}
      <RestoreCheckpointDialog
        isOpen={Boolean(restoringCheckpoint)}
        onClose={() => setRestoringCheckpoint(null)}
        checkpoint={restoringCheckpoint}
        sequenceNumber={restoringCheckpoint ? (sequenceMap.get(restoringCheckpoint.id) ?? 1) : 1}
        currentPassport={passport}
        onRestored={(restored) => {
          fetchCheckpoints();
          if (onPassportUpdated) onPassportUpdated(restored);
        }}
      />
    </div>
  );
}
