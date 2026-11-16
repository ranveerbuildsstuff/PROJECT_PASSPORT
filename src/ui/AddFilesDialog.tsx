import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Badge } from './Badge';
import { useToast } from './useToast';
import {
  type WorkerIncomingFileInput,
  type FilesWorkerIncomingMessage,
  type FilesWorkerOutgoingMessage,
  type FilesWorkerState,
  handleFilesWorkerMessage,
} from '../import/files.worker';
import {
  type SecretFinding,
  findingKey,
  DEFAULT_IGNORE_LIST,
} from '../domain';
import {
  addProjectFiles,
  describeStorageError,
} from '../storage';
import { detectCapabilities, FOLDER_UPLOAD_UNAVAILABLE_MESSAGE } from '../lib/capabilities';
import {
  ShieldAlert,
  AlertTriangle,
  FileCode,
  Folder,
  Archive,
  Loader2,
  EyeOff,
  Plus,
  X,
} from 'lucide-react';

export interface AddFilesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: () => void;
}

type FindingAction = 'redact' | 'exclude' | 'false_positive';

export function AddFilesDialog({
  isOpen,
  onClose,
  projectId,
  onSuccess,
}: AddFilesDialogProps): React.ReactElement {
  const { showToast } = useToast();
  const capabilities = useMemo(() => detectCapabilities(), []);

  const [step, setStep] = useState<'empty' | 'scanning' | 'error' | 'review'>('empty');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Staged input files for scanning
  const [stagedInputs, setStagedInputs] = useState<WorkerIncomingFileInput[]>([]);
  // Session-editable ignore list
  const [sessionIgnoreList, setSessionIgnoreList] = useState<string[]>(DEFAULT_IGNORE_LIST);
  const [newIgnorePattern, setNewIgnorePattern] = useState('');

  // Scan results from worker
  const [includedFiles, setIncludedFiles] = useState<
    Array<{ path: string; sizeBytes: number; tokenEstimate: number }>
  >([]);
  const [ignoredFiles, setIgnoredFiles] = useState<Array<{ path: string; reason: string }>>([]);
  const [hardBlockedPaths, setHardBlockedPaths] = useState<string[]>([]);
  const [findings, setFindings] = useState<SecretFinding[]>([]);

  // Resolution state per finding key: 'redact' | 'exclude' | 'false_positive'
  const [resolutions, setResolutions] = useState<Map<string, FindingAction>>(new Map());

  const [isAttaching, setIsAttaching] = useState(false);

  // Worker reference & fallback state
  const workerRef = useRef<Worker | null>(null);
  const fallbackStateRef = useRef<FilesWorkerState>({
    stagedFiles: new Map(),
    hardBlockedPaths: [],
    ignoredFiles: [],
    allFindings: [],
  });

  const resetState = () => {
    setStep('empty');
    setErrorMessage(null);
    setStagedInputs([]);
    setIncludedFiles([]);
    setIgnoredFiles([]);
    setHardBlockedPaths([]);
    setFindings([]);
    setResolutions(new Map());
    setIsAttaching(false);
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen]);

  // Launch worker scan
  const executeScan = async (inputs: WorkerIncomingFileInput[], ignoreList: string[]) => {
    setStep('scanning');
    setErrorMessage(null);

    const message: FilesWorkerIncomingMessage = {
      action: 'scan',
      files: inputs,
      ignoreList,
    };

    if (typeof Worker !== 'undefined') {
      try {
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL('../import/files.worker.ts', import.meta.url),
            { type: 'module' }
          );
        }

        const worker = workerRef.current;

        worker.onmessage = (event: MessageEvent<FilesWorkerOutgoingMessage>) => {
          const data = event.data;
          if (data.type === 'scan_result') {
            if (data.result.ok) {
              setIncludedFiles(data.result.included);
              setIgnoredFiles(data.result.ignored);
              setHardBlockedPaths(data.result.hardBlocked);
              setFindings(data.result.findings);
              setResolutions(new Map());
              setStep('review');
            } else {
              setStep('error');
              setErrorMessage(data.result.message);
            }
          }
        };

        worker.onerror = () => {
          setStep('error');
          setErrorMessage('An unexpected error occurred while scanning files.');
        };

        worker.postMessage(message);
        return;
      } catch {
        // Fall back to in-memory below
      }
    }

    // In-memory fallback
    const { nextState, response } = await handleFilesWorkerMessage(
      fallbackStateRef.current,
      message
    );
    fallbackStateRef.current = nextState;

    if (response.type === 'scan_result') {
      if (response.result.ok) {
        setIncludedFiles(response.result.included);
        setIgnoredFiles(response.result.ignored);
        setHardBlockedPaths(response.result.hardBlocked);
        setFindings(response.result.findings);
        setResolutions(new Map());
        setStep('review');
      } else {
        setStep('error');
        setErrorMessage(response.result.message);
      }
    }
  };

  // Handle file selections
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>, isZip = false) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    const inputs: WorkerIncomingFileInput[] = filesArray.map((file) => {
      // webkitRelativePath contains relative path if selected via folder picker
      const path = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return {
        name: file.name,
        path,
        size: file.size,
        file,
        isZip,
      };
    });

    setStagedInputs(inputs);
    void executeScan(inputs, sessionIgnoreList);
  };

  // Finding action handlers
  const handleSetFindingAction = (finding: SecretFinding, action: FindingAction) => {
    const key = findingKey(finding);
    setResolutions((prev) => {
      const next = new Map(prev);
      next.set(key, action);
      return next;
    });
  };

  // Unresolved findings count
  const unresolvedCount = useMemo(() => {
    let count = 0;
    for (const f of findings) {
      const key = findingKey(f);
      if (!resolutions.has(key)) {
        count++;
      }
    }
    return count;
  }, [findings, resolutions]);

  // Commit and attach reviewed files
  const handleAttach = async () => {
    if (unresolvedCount > 0) return;
    setIsAttaching(true);

    const redactFindings: SecretFinding[] = [];
    const excludedPaths = new Set<string>();
    const ackKeys: string[] = [];

    for (const f of findings) {
      const key = findingKey(f);
      const action = resolutions.get(key);
      if (action === 'redact') {
        redactFindings.push(f);
      } else if (action === 'exclude') {
        excludedPaths.add(f.path);
      } else if (action === 'false_positive') {
        ackKeys.push(key);
      }
    }

    const commitMessage: FilesWorkerIncomingMessage = {
      action: 'commit',
      redactions: redactFindings,
      excludedPaths: Array.from(excludedPaths),
      acknowledgedKeys: ackKeys,
    };

    let finalizedFiles: Array<{
      path: string;
      content?: string;
      sizeBytes: number;
      included: boolean;
      acknowledgedFindings: string[];
    }> = [];

    if (typeof Worker !== 'undefined' && workerRef.current) {
      try {
        finalizedFiles = await new Promise((resolve, reject) => {
          const worker = workerRef.current!;
          worker.onmessage = (event: MessageEvent<FilesWorkerOutgoingMessage>) => {
            if (event.data.type === 'commit_result') {
              resolve(event.data.files);
            } else {
              reject(new Error('Commit failed'));
            }
          };
          worker.onerror = (e) => reject(e);
          worker.postMessage(commitMessage);
        });
      } catch {
        // Fall back below
      }
    }

    if (finalizedFiles.length === 0) {
      const { response } = await handleFilesWorkerMessage(
        fallbackStateRef.current,
        commitMessage
      );
      if (response.type === 'commit_result') {
        finalizedFiles = response.files;
      }
    }

    try {
      await addProjectFiles(
        projectId,
        finalizedFiles.map((f) => ({
          path: f.path,
          content: f.content,
          sizeBytes: f.sizeBytes,
          included: f.included,
          acknowledgedFindings: f.acknowledgedFindings,
        }))
      );

      showToast(`Attached ${finalizedFiles.length} files.`, 'success');
      handleClose();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setErrorMessage(describeStorageError(err));
      setIsAttaching(false);
    }
  };

  // Add custom pattern to session ignore list
  const handleAddIgnorePattern = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newIgnorePattern.trim();
    if (!trimmed || sessionIgnoreList.includes(trimmed)) return;

    const next = [...sessionIgnoreList, trimmed];
    setSessionIgnoreList(next);
    setNewIgnorePattern('');
    if (stagedInputs.length > 0) {
      void executeScan(stagedInputs, next);
    }
  };

  const handleRemoveIgnorePattern = (pattern: string) => {
    const next = sessionIgnoreList.filter((p) => p !== pattern);
    setSessionIgnoreList(next);
    if (stagedInputs.length > 0) {
      void executeScan(stagedInputs, next);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Add project files"
      description="Select project source files, a folder, or a .zip archive to attach."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-5">
        {/* Step: Empty / Pick Files */}
        {step === 'empty' && (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-text-muted leading-relaxed">
              Choose files, a folder or a .zip file from your project.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Choose Files */}
              <label className="flex flex-col items-center justify-center p-5 rounded-lg border border-border-subtle bg-bg-surface hover:border-accent-brass/80 hover:bg-bg-app transition-colors cursor-pointer text-center group min-h-[44px]">
                <FileCode className="w-6 h-6 text-text-muted group-hover:text-accent-brass mb-2" />
                <span className="text-xs font-semibold text-text-primary">Choose files</span>
                <span className="text-[11px] text-text-muted mt-1">Multi-file selection</span>
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFilesSelected(e, false)}
                  className="sr-only"
                  aria-label="Choose files"
                />
              </label>

              {/* Choose Folder */}
              <label className="flex flex-col items-center justify-center p-5 rounded-lg border border-border-subtle bg-bg-surface hover:border-accent-brass/80 hover:bg-bg-app transition-colors cursor-pointer text-center group min-h-[44px]">
                <Folder className="w-6 h-6 text-text-muted group-hover:text-accent-brass mb-2" />
                <span className="text-xs font-semibold text-text-primary">Choose folder</span>
                <span className="text-[11px] text-text-muted mt-1">
                  {capabilities.webkitdirectory
                    ? 'Directory tree'
                    : 'Folder upload falls back to file selection'}
                </span>
                {!capabilities.webkitdirectory && (
                  <span className="text-[10px] text-color-warning mt-1 leading-tight">
                    {FOLDER_UPLOAD_UNAVAILABLE_MESSAGE}
                  </span>
                )}
                <input
                  type="file"
                  multiple
                  {...(capabilities.webkitdirectory
                    ? {
                        webkitdirectory: '',
                        directory: '',
                      }
                    : {})}
                  onChange={(e) => handleFilesSelected(e, false)}
                  className="sr-only"
                  aria-label="Choose folder"
                />
              </label>

              {/* Choose .zip */}
              <label className="flex flex-col items-center justify-center p-5 rounded-lg border border-border-subtle bg-bg-surface hover:border-accent-brass/80 hover:bg-bg-app transition-colors cursor-pointer text-center group min-h-[44px]">
                <Archive className="w-6 h-6 text-text-muted group-hover:text-accent-brass mb-2" />
                <span className="text-xs font-semibold text-text-primary">Choose .zip</span>
                <span className="text-[11px] text-text-muted mt-1">Safe archive unzip</span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => handleFilesSelected(e, true)}
                  className="sr-only"
                  aria-label="Choose .zip"
                />
              </label>
            </div>
          </div>
        )}

        {/* Step: Scanning */}
        {step === 'scanning' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <Loader2 className="w-8 h-8 text-accent-brass animate-spin" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">
                Analyzing and scanning project files...
              </span>
              <span className="text-xs text-text-muted">
                Checking paths, applying ignore filters, and scanning for secrets off-thread.
              </span>
            </div>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-lg bg-color-danger/10 border border-color-danger/40 flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-color-danger shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <h4 className="text-xs font-semibold text-text-primary">File ingestion blocked</h4>
                <p className="text-xs text-text-muted leading-relaxed">
                  {errorMessage || 'An error occurred while reading the selected files.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep('empty')}
                className="min-h-[44px]"
              >
                Choose different files
              </Button>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="flex flex-col gap-5 max-h-[60vh] overflow-y-auto pr-1">
            {/* 1. Skipped for safety (hard-blocked) */}
            {hardBlockedPaths.length > 0 && (
              <div className="p-3.5 rounded-lg bg-color-danger/10 border border-color-danger/30 flex flex-col gap-2">
                <div className="flex items-start gap-2 text-color-danger">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold">
                    We skipped {hardBlockedPaths.length} files that often hold secrets, such as .env
                    files and private keys. They were never read or stored.
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-6">
                  {hardBlockedPaths.map((p) => (
                    <Badge key={p} variant="danger" className="text-[11px] font-mono">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Ignored files */}
            {ignoredFiles.length > 0 && (
              <div className="p-3.5 rounded-lg bg-bg-surface border border-border-subtle flex flex-col gap-2.5">
                <div className="flex items-start gap-2 text-text-muted text-xs">
                  <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {ignoredFiles.length} files were skipped because they are build output,
                    dependencies, binaries or larger than 500 KB.
                  </span>
                </div>

                {/* Session ignore list editor */}
                <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle/50">
                  <span className="text-[11px] font-medium text-text-primary">
                    Active ignore list (editable for this session):
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {sessionIgnoreList.map((pattern) => (
                      <span
                        key={pattern}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-app border border-border-subtle text-[11px] font-mono text-text-secondary"
                      >
                        {pattern}
                        <button
                          type="button"
                          onClick={() => handleRemoveIgnorePattern(pattern)}
                          className="text-text-muted hover:text-color-danger focus:outline-none"
                          aria-label={`Remove ignore pattern ${pattern}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <form onSubmit={handleAddIgnorePattern} className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={newIgnorePattern}
                      onChange={(e) => setNewIgnorePattern(e.target.value)}
                      placeholder="Add pattern (e.g. *.tmp, build/)"
                      className="flex-1 text-xs bg-bg-app border border-border-subtle rounded px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-brass"
                    />
                    <Button type="submit" variant="secondary" size="sm" className="min-h-[32px] text-xs">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </form>
                </div>
              </div>
            )}

            {/* 3. Secret findings */}
            {findings.length > 0 && (
              <div className="flex flex-col gap-3 p-3.5 rounded-lg bg-color-warning/10 border border-color-warning/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-color-warning">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold">
                      We found {findings.length} possible secrets. Choose what to do with each one
                      before attaching.
                    </span>
                  </div>
                  {unresolvedCount > 0 && (
                    <Badge variant="warning" className="text-[10px]">
                      {unresolvedCount} unresolved
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col gap-2.5 mt-1">
                  {findings.map((f) => {
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
                          <span className="font-mono text-[11px] text-accent-brass bg-accent-brass/10 px-2 py-0.5 rounded">
                            {f.masked}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          <button
                            type="button"
                            onClick={() => handleSetFindingAction(f, 'redact')}
                            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors min-h-[44px] ${
                              action === 'redact'
                                ? 'bg-color-success/15 border-color-success text-color-success'
                                : 'bg-bg-app border-border-subtle text-text-primary hover:border-accent-brass'
                            }`}
                          >
                            Redact
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetFindingAction(f, 'exclude')}
                            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors min-h-[44px] ${
                              action === 'exclude'
                                ? 'bg-color-danger/15 border-color-danger text-color-danger'
                                : 'bg-bg-app border-border-subtle text-text-primary hover:border-accent-brass'
                            }`}
                          >
                            Exclude file
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetFindingAction(f, 'false_positive')}
                            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors min-h-[44px] ${
                              action === 'false_positive'
                                ? 'bg-accent-brass/20 border-accent-brass text-accent-brass'
                                : 'bg-bg-app border-border-subtle text-text-primary hover:border-accent-brass'
                            }`}
                          >
                            Mark as false positive
                          </button>
                        </div>

                        {/* Status feedback */}
                        {action === 'redact' && (
                          <span className="text-[11px] text-color-success">
                            The secret was replaced with [REDACTED] in the stored copy.
                          </span>
                        )}
                        {action === 'false_positive' && (
                          <span className="text-[11px] text-accent-brass">
                            Kept. This finding is marked as reviewed.
                          </span>
                        )}
                        {action === 'exclude' && (
                          <span className="text-[11px] text-color-danger">
                            File will be excluded from package content.
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Included files summary */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-text-primary">
                Files to attach ({includedFiles.length}):
              </span>
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
                {includedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded bg-bg-surface border border-border-subtle/50"
                  >
                    <span className="font-mono text-text-primary truncate">{file.path}</span>
                    <span className="font-mono text-text-muted shrink-0 ml-2">
                      ~{file.tokenEstimate.toLocaleString()} tokens (estimate)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
              <div className="text-xs text-text-muted">
                {unresolvedCount > 0 ? (
                  <span className="text-color-warning">
                    Resolve {unresolvedCount} possible secrets to attach these files.
                  </span>
                ) : (
                  <span>Ready to attach {includedFiles.length} files.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={handleClose}
                  disabled={isAttaching}
                  className="min-h-[44px] min-w-[44px]"
                >
                  Cancel
                </Button>

                <Button
                  variant="primary"
                  onClick={handleAttach}
                  disabled={unresolvedCount > 0 || isAttaching || includedFiles.length === 0}
                  className="min-h-[44px] min-w-[44px]"
                >
                  {isAttaching ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Attaching...
                    </span>
                  ) : (
                    `Attach files (${includedFiles.length})`
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
