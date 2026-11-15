import React, { useState } from 'react';
import { type PassportV1 } from '../../domain';
import {
  updateProjectFileMeta,
  removeProjectFile,
  restoreProjectFile,
  describeStorageError,
} from '../../storage';
import { useToast } from '../../ui/useToast';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { AddFilesDialog } from '../../ui/AddFilesDialog';
import {
  FileCode,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { formatBytes } from '../../lib';

export interface FilesTabProps {
  projectId: string;
  passport: PassportV1;
}

export function FilesTab({
  projectId,
  passport,
}: FilesTabProps): React.ReactElement {
  const { showToast } = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingPurposes, setEditingPurposes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const files = passport.files || [];

  const handlePurposeChange = (path: string, value: string) => {
    setEditingPurposes((prev) => ({
      ...prev,
      [path]: value,
    }));
  };

  const handlePurposeBlur = async (path: string) => {
    const newPurpose = editingPurposes[path];
    if (newPurpose === undefined) return;

    try {
      await updateProjectFileMeta(
        projectId,
        path,
        { purpose: newPurpose },
        { expectedUpdatedAt: passport.project.updatedAt }
      );
    } catch (err) {
      setError(describeStorageError(err));
    }
  };

  const handleToggleInclude = async (path: string, currentIncluded: boolean) => {
    try {
      await updateProjectFileMeta(
        projectId,
        path,
        { included: !currentIncluded },
        { expectedUpdatedAt: passport.project.updatedAt }
      );
    } catch (err) {
      setError(describeStorageError(err));
    }
  };

  const handleRemove = async (path: string) => {
    try {
      const removedPayload = await removeProjectFile(
        projectId,
        path,
        { expectedUpdatedAt: passport.project.updatedAt }
      );

      showToast(
        `Removed "${path}".`,
        'info',
        undefined,
        {
          label: 'Undo',
          onClick: async () => {
            try {
              await restoreProjectFile(projectId, removedPayload);
              showToast(`Restored "${path}".`, 'success');
            } catch (err) {
              showToast(describeStorageError(err), 'error');
            }
          },
        }
      );
    } catch (err) {
      setError(describeStorageError(err));
    }
  };

  const totalTokens = files
    .filter((f) => f.included)
    .reduce((sum, f) => sum + Math.ceil(f.sizeBytes / 4), 0);

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* Header and Add action */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-text-primary">Files</h2>
            <Badge variant="default" className="text-xs font-mono">
              {files.length}
            </Badge>
          </div>
          <p className="text-xs text-text-muted">
            Project source files included in handoff packages with purpose annotations.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsAddOpen(true)}
          className="min-h-[44px] min-w-[44px] gap-2"
        >
          <Plus className="w-4 h-4 text-accent-brass" aria-hidden="true" />
          <span>Add files</span>
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-color-danger bg-color-danger/10 text-text-primary flex items-start gap-2.5 text-xs"
        >
          <AlertCircle className="w-4 h-4 text-color-danger shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-text-muted leading-relaxed">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-xl mx-auto my-4">
          <div className="w-12 h-12 rounded-full bg-bg-app border border-border-subtle flex items-center justify-center text-accent-brass mb-3">
            <FileCode className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">
            No project files attached yet
          </h3>
          <p className="text-xs text-text-muted leading-relaxed mb-5 max-w-md">
            Add source files, a directory, or an archive to include key architecture documents,
            schemas, and configurations in your passport package.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="min-h-[44px] min-w-[44px] gap-2"
          >
            <Plus className="w-4 h-4 text-accent-brass" aria-hidden="true" />
            <span>Add files</span>
          </Button>
        </Card>
      ) : (
        /* Manifest View */
        <div className="flex flex-col gap-4">
          {/* Summary bar */}
          <div className="flex items-center justify-between text-xs text-text-muted px-1">
            <span>
              {files.filter((f) => f.included).length} of {files.length} files included
            </span>
            <span className="font-mono">
              ~{totalTokens.toLocaleString()} tokens (estimate)
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {files.map((file) => {
              const purposeVal =
                editingPurposes[file.path] !== undefined
                  ? editingPurposes[file.path]
                  : file.purpose;

              const tokens = Math.ceil(file.sizeBytes / 4);

              return (
                <div
                  key={file.path}
                  className={`p-3.5 rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    file.included
                      ? 'border-border-subtle bg-bg-surface'
                      : 'border-border-subtle/50 bg-bg-surface/40 opacity-70'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="pt-0.5">
                      <input
                        type="checkbox"
                        checked={file.included}
                        onChange={() => handleToggleInclude(file.path, file.included)}
                        aria-label={`Include ${file.path}`}
                        className="rounded border-border-subtle text-accent-brass focus:ring-accent-brass w-4 h-4 cursor-pointer"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-text-primary break-all">
                          {file.path}
                        </span>
                        {!file.included && (
                          <Badge variant="default" className="text-[10px] py-0">
                            Excluded
                          </Badge>
                        )}
                      </div>

                      {/* Editable purpose field */}
                      <input
                        type="text"
                        value={purposeVal}
                        onChange={(e) => handlePurposeChange(file.path, e.target.value)}
                        onBlur={() => handlePurposeBlur(file.path)}
                        placeholder="Describe file purpose (e.g. Core schema, database client)"
                        aria-label={`Purpose for ${file.path}`}
                        className="text-xs bg-bg-app/70 border border-border-subtle/70 rounded px-2.5 py-1 text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-accent-brass w-full max-w-md min-h-[36px]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-border-subtle/40">
                    <div className="flex items-center gap-3 text-[11px] font-mono text-text-muted">
                      <span>{formatBytes(file.sizeBytes)}</span>
                      <span>~{tokens.toLocaleString()} tokens (estimate)</span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(file.path)}
                      aria-label={`Remove ${file.path}`}
                      className="text-text-muted hover:text-color-danger min-h-[44px] min-w-[44px] p-2"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AddFilesDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
