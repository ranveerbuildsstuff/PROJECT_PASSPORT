import React, { useState, useRef } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Badge } from './Badge';
import { useToast } from './useToast';
import { FileArchive, AlertTriangle, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import { parsePackageZip, type PackageImportSuccess } from '../import/packageImport';
import { importPackage, getProject } from '../storage';

export interface ImportPackageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (projectId: string) => void;
}

export function ImportPackageDialog({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportPackageDialogProps): React.ReactElement {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPackage, setParsedPackage] = useState<PackageImportSuccess | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictAction, setConflictAction] = useState<'copy' | 'replace'>('copy');
  const [isImporting, setIsImporting] = useState(false);

  const resetState = () => {
    setIsParsing(false);
    setParseError(null);
    setParsedPackage(null);
    setHasConflict(false);
    setConflictAction('copy');
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isImporting) return;
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError(null);
    setParsedPackage(null);
    setHasConflict(false);

    try {
      const buffer = await file.arrayBuffer();
      const res = await parsePackageZip(buffer);

      if (!res.ok) {
        setParseError(res.message);
        setIsParsing(false);
        return;
      }

      setParsedPackage(res);

      // Check for same-ID project collision
      const existing = await getProject(res.passport.project.id);
      if (existing) {
        setHasConflict(true);
        setConflictAction('copy');
      }
    } catch {
      setParseError('Could not process this .zip package.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsedPackage || isImporting) return;

    setIsImporting(true);
    try {
      const importedId = await importPackage(parsedPackage, {
        conflictAction: hasConflict ? conflictAction : undefined,
      });

      showToast(`Imported project "${parsedPackage.passport.project.name}"`, 'success');
      resetState();
      onClose();
      onImportSuccess?.(importedId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import project package.';
      setParseError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Handoff Package"
      description="Upload a verified .zip package to restore project context, files, and conversation transcripts."
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* File Picker */}
        {!parsedPackage && (
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              className="hidden"
              id="package-file-input"
            />
            <label
              htmlFor="package-file-input"
              className="border-2 border-dashed border-border-subtle rounded-lg p-6 flex flex-col items-center justify-center gap-2.5 hover:border-accent-brass/80 hover:bg-bg-app transition-colors cursor-pointer text-center min-h-[140px]"
            >
              <div className="w-10 h-10 rounded-full bg-accent-brass/10 text-accent-brass flex items-center justify-center">
                <FileArchive className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-xs font-semibold text-text-primary block">
                  Choose .zip handoff package
                </span>
                <span className="text-[11px] text-text-muted mt-0.5 block">
                  Must contain MANIFEST.json and project-passport.json
                </span>
              </div>
            </label>

            {isParsing && (
              <div className="flex items-center justify-center gap-2 text-xs text-text-muted py-2">
                <Loader2 className="w-4 h-4 animate-spin text-accent-brass" aria-hidden="true" />
                <span>Verifying package integrity & SHA-256 hashes...</span>
              </div>
            )}
          </div>
        )}

        {/* Error Alert */}
        {parseError && (
          <div
            className="p-3 rounded-lg border border-color-danger/30 bg-color-danger/10 text-xs text-text-primary flex items-start gap-2"
            role="alert"
          >
            <AlertTriangle className="w-4 h-4 text-color-danger shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <span className="font-semibold text-color-danger">Verification Failed</span>
              <p className="text-text-muted">{parseError}</p>
            </div>
          </div>
        )}

        {/* Package Preview */}
        {parsedPackage && (
          <div className="space-y-3">
            <div className="p-3.5 rounded-lg border border-border-subtle bg-bg-app space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary text-sm truncate">
                  {parsedPackage.passport.project.name || 'Untitled Project'}
                </span>
                <Badge variant="success">Verified Archive</Badge>
              </div>

              {parsedPackage.passport.project.goal && (
                <p className="text-text-muted text-[11px] line-clamp-2">
                  Goal: {parsedPackage.passport.project.goal}
                </p>
              )}

              <div className="flex items-center gap-3 pt-1 text-[11px] text-text-muted border-t border-border-subtle/50">
                <span>{parsedPackage.files.length} project files</span>
                <span>•</span>
                <span>{parsedPackage.conversations.length} conversations</span>
                <span>•</span>
                <span>Schema v{parsedPackage.passport.schemaVersion}</span>
              </div>
            </div>

            {/* Findings Notice */}
            {parsedPackage.findings.length > 0 && (
              <div className="p-3 rounded-lg border border-color-warning/30 bg-color-warning/10 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-color-warning shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-color-warning">Security notice</span>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    This package contains {parsedPackage.findings.length} files with secret findings. You can review them in the Files tab after import.
                  </p>
                </div>
              </div>
            )}

            {/* Same-ID Conflict Choices */}
            {hasConflict && (
              <div className="p-3.5 rounded-lg border border-border-subtle bg-bg-surface space-y-2.5 text-xs">
                <span className="font-semibold text-text-primary block">
                  A project with this ID already exists locally:
                </span>

                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-2 rounded hover:bg-bg-app cursor-pointer">
                    <input
                      type="radio"
                      name="conflict-action"
                      checked={conflictAction === 'copy'}
                      onChange={() => setConflictAction('copy')}
                      className="mt-0.5 text-accent-brass focus:ring-accent-brass cursor-pointer"
                    />
                    <div>
                      <span className="font-medium text-text-primary block">
                        Import as a copy (Recommended)
                      </span>
                      <span className="text-[11px] text-text-muted block mt-0.5">
                        Assigns a new project ID and keeps your existing local project intact.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2 rounded hover:bg-bg-app cursor-pointer">
                    <input
                      type="radio"
                      name="conflict-action"
                      checked={conflictAction === 'replace'}
                      onChange={() => setConflictAction('replace')}
                      className="mt-0.5 text-accent-brass focus:ring-accent-brass cursor-pointer"
                    />
                    <div>
                      <span className="font-medium text-color-danger block">
                        Replace existing project
                      </span>
                      <span className="text-[11px] text-text-muted block mt-0.5">
                        Overwrites existing passport, files, and transcripts for this ID.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dialog Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-subtle">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isImporting}
            className="min-h-[44px]"
          >
            Cancel
          </Button>

          {parsedPackage && (
            <Button
              type="button"
              variant="primary"
              onClick={handleImport}
              disabled={isImporting}
              className="min-h-[44px] gap-1.5"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Import project</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
