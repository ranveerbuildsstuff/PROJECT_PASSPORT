import React, { useState, useRef, useMemo } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Badge } from './Badge';
import { useToast } from './useToast';
import { FileArchive, AlertTriangle, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import { parsePackageZip, type PackageImportSuccess } from '../import/packageImport';
import { importPackage, getProject } from '../storage';
import { type SecretFinding, findingKey, redactText } from '../domain';

export interface ImportPackageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (projectId: string) => void;
}

type FindingAction = 'redact' | 'exclude' | 'false_positive';

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
  const [resolutions, setResolutions] = useState<Map<string, FindingAction>>(new Map());

  const allFindings = useMemo<SecretFinding[]>(() => {
    return parsedPackage ? parsedPackage.findings.flatMap((f) => f.findings) : [];
  }, [parsedPackage]);

  const setAction = (key: string, action: FindingAction) => {
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(key, action);
      return next;
    });
  };

  const unresolvedCount = useMemo(() => {
    return allFindings.filter((f) => !resolutions.has(findingKey(f))).length;
  }, [allFindings, resolutions]);

  const resetState = () => {
    setIsParsing(false);
    setParseError(null);
    setParsedPackage(null);
    setHasConflict(false);
    setConflictAction('copy');
    setIsImporting(false);
    setResolutions(new Map());
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
    setResolutions(new Map());

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
      // Group findings to redact or exclude
      const excludedPaths = new Set(
        allFindings
          .filter((f) => resolutions.get(findingKey(f)) === 'exclude')
          .map((f) => f.path)
      );

      const redactionMap = new Map<string, SecretFinding[]>();
      for (const f of allFindings) {
        if (resolutions.get(findingKey(f)) === 'redact') {
          const list = redactionMap.get(f.path) ?? [];
          list.push(f);
          redactionMap.set(f.path, list);
        }
      }

      const ackSet = new Set(
        allFindings
          .filter((f) => {
            const act = resolutions.get(findingKey(f));
            return act === 'false_positive' || act === 'redact';
          })
          .map(findingKey)
      );

      const finalizedFiles = parsedPackage.files.map((file) => {
        const isExcluded = excludedPaths.has(file.path);
        const fileFindings =
          parsedPackage.findings.find((pf) => pf.path === file.path)?.findings ?? [];
        const fileAckKeys = fileFindings.map(findingKey).filter((k) => ackSet.has(k));

        if (isExcluded) {
          return {
            path: file.path,
            purpose: file.purpose,
            sizeBytes: file.sizeBytes,
            included: false,
            acknowledgedFindings: fileAckKeys,
          };
        }

        const toRedact = redactionMap.get(file.path);
        let finalContent = file.content;
        if (toRedact && toRedact.length > 0) {
          finalContent = redactText(finalContent, toRedact);
        }

        return {
          path: file.path,
          purpose: file.purpose,
          content: finalContent,
          sizeBytes: new Blob([finalContent]).size,
          included: file.included,
          acknowledgedFindings: fileAckKeys,
        };
      });

      const payloadToImport = {
        ...parsedPackage,
        files: finalizedFiles,
      };

      const importedId = await importPackage(payloadToImport, {
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

            {/* Secret Review Section */}
            {allFindings.length > 0 && (
              <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-color-warning/10 border border-color-warning/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-color-warning">
                    <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="text-xs font-semibold">
                      We found {allFindings.length} possible secret{allFindings.length === 1 ? '' : 's'}. Choose what to do with each one before importing.
                    </span>
                  </div>
                  {unresolvedCount > 0 && (
                    <Badge variant="warning" className="text-[10px]">
                      {unresolvedCount} unresolved
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 mt-1 max-h-56 overflow-y-auto pr-1">
                  {allFindings.map((f) => {
                    const key = findingKey(f);
                    const action = resolutions.get(key);

                    return (
                      <div
                        key={key}
                        className="p-3 rounded-md bg-bg-surface border border-border-subtle flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="brass" className="text-[10px]">
                              {f.category}
                            </Badge>
                            <span className="font-mono text-text-primary text-[11px] font-medium">
                              {f.path}:{f.line}
                            </span>
                          </div>
                          <span className="text-[11px] text-text-muted font-mono">
                            {f.masked}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-border-subtle/50">
                          <button
                            type="button"
                            onClick={() => setAction(key, 'redact')}
                            className={`px-2.5 py-1 text-xs rounded border transition-colors min-h-[36px] flex items-center gap-1.5 ${
                              action === 'redact'
                                ? 'bg-accent-brass text-accent-brass-contrast border-accent-brass font-medium'
                                : 'bg-bg-app text-text-primary border-border-subtle hover:border-accent-brass/80'
                            }`}
                          >
                            <span>Redact</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAction(key, 'exclude')}
                            className={`px-2.5 py-1 text-xs rounded border transition-colors min-h-[36px] flex items-center gap-1.5 ${
                              action === 'exclude'
                                ? 'bg-color-danger text-white border-color-danger font-medium'
                                : 'bg-bg-app text-text-primary border-border-subtle hover:border-color-danger/80'
                            }`}
                          >
                            <span>Exclude</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAction(key, 'false_positive')}
                            className={`px-2.5 py-1 text-xs rounded border transition-colors min-h-[36px] flex items-center gap-1.5 ${
                              action === 'false_positive'
                                ? 'bg-color-success text-white border-color-success font-medium'
                                : 'bg-bg-app text-text-primary border-border-subtle hover:border-color-success/80'
                            }`}
                          >
                            <span>False Positive</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
