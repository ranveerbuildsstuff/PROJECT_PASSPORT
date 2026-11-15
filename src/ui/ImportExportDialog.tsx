import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Badge } from './Badge';
import { useToast } from './useToast';
import {
  type ParsedConversationSummary,
  type WorkerIncomingMessage,
  type WorkerOutgoingMessage,
  type WorkerState,
  handleWorkerMessage,
} from '../import/parser.worker';
import {
  type ParseExportFailure,
} from '../import/parseExport';
import {
  addImportedConversations,
  describeStorageError,
} from '../storage';
import { type ConversationTurn } from '../domain';
import { type ConversationRef } from '../domain/passport.schema';
import {
  AlertTriangle,
  FileText,
  Search,
  CheckSquare,
  Square,
  Loader2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { formatDateTime } from '../lib';

export interface ImportExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  existingConversations?: readonly ConversationRef[];
  onSuccess?: () => void;
}

const MEMORY_WARNING_THRESHOLD_BYTES = 300 * 1024 * 1024; // 300 MB

interface StagedFile {
  name: string;
  size: number;
  file?: File;
  text?: string;
}

export function ImportExportDialog({
  isOpen,
  onClose,
  projectId,
  existingConversations = [],
  onSuccess,
}: ImportExportDialogProps): React.ReactElement {
  const { showToast } = useToast();

  const [step, setStep] = useState<'empty' | 'warning_300mb' | 'loading' | 'error' | 'select'>('empty');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [totalSizeBytes, setTotalSizeBytes] = useState(0);
  const [includeSystemHidden, setIncludeSystemHidden] = useState(false);

  const [summaries, setSummaries] = useState<ParsedConversationSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ParseExportFailure | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  // Worker reference
  const workerRef = useRef<Worker | null>(null);
  // In-memory fallback state for testing environments without Worker
  const fallbackStateRef = useRef<WorkerState>({ parsedConversations: new Map() });

  // Set of existing attached IDs or source IDs for duplicate detection
  const existingIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const c of existingConversations) {
      ids.add(c.id);
      // Also match if id is prefixed with projectId
      if (c.id.includes(':')) {
        const parts = c.id.split(':');
        if (parts[1]) ids.add(parts[1]);
      }
    }
    return ids;
  }, [existingConversations]);

  const resetState = () => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    fallbackStateRef.current = { parsedConversations: new Map() };
    setStep('empty');
    setStagedFiles([]);
    setTotalSizeBytes(0);
    setSummaries([]);
    setSelectedIds(new Set());
    setSearchFilter('');
    setErrorMessage(null);
    setErrorDetails(null);
    setIsAttaching(false);
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

  // Read files and check memory warning threshold
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    let totalSize = 0;
    const filesArray = Array.from(fileList);

    // Check for zip files immediately by extension
    for (const file of filesArray) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        setStep('error');
        setErrorMessage('This is a .zip file. Unzip it first, then choose conversations.json.');
        setErrorDetails({
          ok: false,
          code: 'zip_not_supported',
          message: 'This is a .zip file. Unzip it first, then choose conversations.json.',
        });
        return;
      }
      totalSize += file.size;
    }

    setTotalSizeBytes(totalSize);

    // Staged files hold File references directly; no main-thread byte reading!
    const loadedFiles: StagedFile[] = filesArray.map((file) => ({
      name: file.name,
      size: file.size,
      file,
    }));

    setStagedFiles(loadedFiles);

    if (totalSize > MEMORY_WARNING_THRESHOLD_BYTES) {
      setStep('warning_300mb');
    } else {
      void executeParse(loadedFiles, includeSystemHidden);
    }
  };

  // Launch parsing via Web Worker (or test-only fallback)
  const executeParse = async (files: StagedFile[], includeSystem: boolean) => {
    setStep('loading');
    setErrorMessage(null);
    setErrorDetails(null);

    const message: WorkerIncomingMessage = {
      action: 'parse',
      files: files.map((f) => ({ name: f.name, file: f.file, text: f.text })),
      options: { includeSystemHidden: includeSystem },
    };

    if (typeof Worker !== 'undefined') {
      try {
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL('../import/parser.worker.ts', import.meta.url),
            { type: 'module' }
          );
        }

        const worker = workerRef.current;

        worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
          const data = event.data;
          if (data.type === 'parse_result') {
            if (data.result.ok) {
              setSummaries(data.result.summaries);
              // Default select all
              setSelectedIds(new Set(data.result.summaries.map((s) => s.id)));
              setStep('select');
            } else {
              setStep('error');
              setErrorMessage(data.result.message);
              setErrorDetails(data.result);
            }
          }
        };

        worker.onerror = () => {
          setStep('error');
          setErrorMessage('An unexpected error occurred while parsing the file.');
        };

        worker.postMessage(message);
        return;
      } catch {
        // Fall back to pure in-memory execution below
      }
    }

    // Fallback if Worker is unavailable or throws (test-only environments, e.g. jsdom)
    const fallbackFiles: Array<{ name: string; text?: string; json?: unknown }> = [];
    try {
      for (const f of files) {
        if (f.text) {
          fallbackFiles.push({ name: f.name, text: f.text });
        } else if (f.file) {
          const text = await f.file.text();
          fallbackFiles.push({ name: f.name, text });
        }
      }
    } catch {
      setStep('error');
      setErrorMessage('Could not read the selected file.');
      return;
    }

    const fallbackMessage: WorkerIncomingMessage = {
      action: 'parse',
      files: fallbackFiles,
      options: { includeSystemHidden: includeSystem },
    };

    const { nextState, response } = handleWorkerMessage(fallbackStateRef.current, fallbackMessage);
    fallbackStateRef.current = nextState;

    if (response.type === 'parse_result') {
      if (response.result.ok) {
        setSummaries(response.result.summaries);
        setSelectedIds(new Set(response.result.summaries.map((s) => s.id)));
        setStep('select');
      } else {
        setStep('error');
        setErrorMessage(response.result.message);
        setErrorDetails(response.result);
      }
    }
  };

  // Toggle "Include system and hidden messages"
  const handleToggleSystem = (checked: boolean) => {
    setIncludeSystemHidden(checked);
    if (stagedFiles.length > 0) {
      void executeParse(stagedFiles, checked);
    }
  };

  // Filter conversations
  const filteredSummaries = useMemo(() => {
    if (!searchFilter.trim()) return summaries;
    const q = searchFilter.toLowerCase();
    return summaries.filter((s) => s.title.toLowerCase().includes(q));
  }, [summaries, searchFilter]);

  // Selection toggle
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of filteredSummaries) {
        next.add(s.id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Selected stats
  const selectedSummaries = useMemo(() => {
    return summaries.filter((s) => selectedIds.has(s.id));
  }, [summaries, selectedIds]);

  const totalSelectedTokens = useMemo(() => {
    return selectedSummaries.reduce((sum, s) => sum + s.tokenEstimate, 0);
  }, [selectedSummaries]);

  const duplicateSelectedCount = useMemo(() => {
    return selectedSummaries.filter((s) => existingIdSet.has(s.id)).length;
  }, [selectedSummaries, existingIdSet]);

  // Attach selected conversations
  const handleAttach = async () => {
    if (selectedIds.size === 0 || isAttaching) return;
    setIsAttaching(true);

    const idsToExtract = Array.from(selectedIds);

    const onTurnsExtracted = async (extractedConversations: Array<{
      id: string;
      title: string;
      source: 'chatgpt' | 'claude';
      createdAt?: string;
      turns: ConversationTurn[];
    }>) => {
      try {
        const itemsToAttach = extractedConversations.map((c) => ({
          id: c.id,
          title: c.title,
          source: c.source,
          createdAt: c.createdAt,
          turns: c.turns,
          included: true,
        }));

        const result = await addImportedConversations(projectId, itemsToAttach, {
          skipExisting: skipDuplicates,
        });

        if (result) {
          const count = result.importedIds.length;
          showToast(
            `Attached ${count} ${count === 1 ? 'conversation' : 'conversations'} to project.`,
            'success'
          );
          onSuccess?.();
          handleClose();
        }
      } catch (err) {
        const desc = describeStorageError(err);
        showToast(desc, 'error');
      } finally {
        setIsAttaching(false);
      }
    };

    // Extract full turns via Worker or fallback
    const extractMsg: WorkerIncomingMessage = {
      action: 'extract',
      ids: idsToExtract,
    };

    if (workerRef.current) {
      workerRef.current.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
        if (event.data.type === 'extract_result') {
          onTurnsExtracted(event.data.conversations);
        }
      };
      workerRef.current.postMessage(extractMsg);
    } else {
      const { response } = handleWorkerMessage(fallbackStateRef.current, extractMsg);
      if (response.type === 'extract_result') {
        onTurnsExtracted(response.conversations);
      }
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Import export file"
      description="Import conversations from an official ChatGPT or Claude export JSON file."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-5 py-1">
        {/* Step: 300 MB Warning */}
        {step === 'warning_300mb' && (
          <div className="flex flex-col gap-4 p-4 rounded-lg bg-color-warning/10 border border-color-warning/40">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-color-warning shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-text-primary">
                  Large export file ({(totalSizeBytes / (1024 * 1024)).toFixed(0)} MB)
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Parsing very large export archives may consume significant memory and take
                  several moments to analyze. Do you want to proceed?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('empty')}
                className="min-h-[44px] min-w-[44px]"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => executeParse(stagedFiles, includeSystemHidden)}
                className="min-h-[44px] min-w-[44px]"
              >
                Proceed
              </Button>
            </div>
          </div>
        )}

        {/* Step: Empty / File Input */}
        {step === 'empty' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border-subtle hover:border-accent-brass/60 rounded-xl bg-bg-surface/50 text-center gap-3 transition-colors">
              <FileText className="w-10 h-10 text-accent-brass/80" />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-text-primary">
                  Choose conversations.json or Claude export
                </span>
                <span className="text-xs text-text-muted">
                  Supports ChatGPT conversations.json (single or multi-shard) and Claude JSON
                  exports.
                </span>
              </div>

              <label className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-md bg-accent-brass text-bg-app text-sm font-semibold cursor-pointer hover:bg-accent-brass/90 focus-within:ring-2 focus-within:ring-accent-brass min-h-[44px] min-w-[44px]">
                <span>Choose JSON files</span>
                <input
                  type="file"
                  accept=".json"
                  multiple
                  onChange={handleFileSelect}
                  className="sr-only"
                  aria-label="Choose export JSON file"
                />
              </label>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-bg-surface border border-border-subtle text-xs text-text-muted">
              <HelpCircle className="w-4 h-4 text-accent-brass shrink-0 mt-0.5" />
              <div>
                <strong>Where to find your export:</strong> In ChatGPT, go to Settings → Data
                controls → Export data, unzip the downloaded archive, and select{' '}
                <code className="text-accent-brass">conversations.json</code>. In Claude, request an
                export from Settings and select the unzipped conversation JSON.
              </div>
            </div>
          </div>
        )}

        {/* Step: Loading */}
        {step === 'loading' && (
          <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
            <Loader2 className="w-8 h-8 text-accent-brass animate-spin" />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">
                Analyzing export archive...
              </span>
              <span className="text-xs text-text-muted">
                Extracting conversation metadata and calculating token budgets off-thread.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (workerRef.current) {
                  workerRef.current.terminate();
                  workerRef.current = null;
                }
                setStep('empty');
              }}
              className="mt-2 min-h-[44px] min-w-[44px]"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Step: Error / Diagnostics Panel */}
        {step === 'error' && (
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-lg bg-color-danger/10 border border-color-danger/40 flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-color-danger shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-text-primary">
                    {errorDetails?.code === 'zip_not_supported'
                      ? 'Zip archive not supported'
                      : errorDetails?.code === 'empty'
                        ? 'Empty file selected'
                        : errorDetails?.code === 'not_json'
                          ? 'Invalid JSON file'
                          : errorDetails?.code === 'out_of_memory'
                            ? 'File too large'
                            : 'Unrecognized export format'}
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {errorMessage || 'The selected file could not be parsed.'}
                  </p>
                </div>
              </div>

              {/* Safe diagnostics: key names only, never message content */}
              {errorDetails?.diagnostics && (
                <div className="mt-2 p-3 rounded bg-bg-app border border-border-subtle/80 flex flex-col gap-2 text-xs">
                  <span className="font-semibold text-text-primary">Diagnostics metadata:</span>
                  <div className="flex flex-col gap-1 text-text-secondary">
                    <div>
                      Items found: <span className="font-mono">{errorDetails.diagnostics.itemCount}</span>
                    </div>
                    <div>
                      Detected keys:{' '}
                      <span className="font-mono text-accent-brass">
                        {errorDetails.diagnostics.detectedKeys.length > 0
                          ? errorDetails.diagnostics.detectedKeys.join(', ')
                          : '(none)'}
                      </span>
                    </div>
                    <div>
                      Expected ChatGPT keys:{' '}
                      <span className="font-mono">
                        {errorDetails.diagnostics.expectedKeys.chatgpt.join(', ')}
                      </span>
                    </div>
                    <div>
                      Expected Claude keys:{' '}
                      <span className="font-mono">
                        {errorDetails.diagnostics.expectedKeys.claude.join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={handleClose}
                className="min-h-[44px] min-w-[44px]"
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep('empty')}
                className="min-h-[44px] min-w-[44px]"
              >
                Choose different file
              </Button>
            </div>
          </div>
        )}

        {/* Step: Selection List */}
        {step === 'select' && (
          <div className="flex flex-col gap-4">
            {/* Header controls: Search & Batch Select */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter conversations by title..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  aria-label="Filter conversations by title"
                  className="w-full pl-9 pr-3 py-2 text-xs font-sans text-text-primary bg-bg-app border border-border-subtle rounded-md focus:outline-none focus:ring-1 focus:ring-accent-brass min-h-[44px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="min-h-[44px] min-w-[44px] gap-1 text-xs"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Select all</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="min-h-[44px] min-w-[44px] gap-1 text-xs"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </Button>
              </div>
            </div>

            {/* Options: Include system/hidden */}
            <div className="flex items-center justify-between py-1 px-1 text-xs text-text-secondary border-b border-border-subtle/50">
              <label className="flex items-center gap-2 cursor-pointer select-none min-h-[44px]">
                <input
                  type="checkbox"
                  checked={includeSystemHidden}
                  onChange={(e) => handleToggleSystem(e.target.checked)}
                  className="rounded border-border-subtle text-accent-brass focus:ring-accent-brass w-4 h-4"
                />
                <span>Include system and hidden messages</span>
              </label>

              <span className="font-mono text-text-muted">
                {selectedIds.size} of {summaries.length} selected (~
                {totalSelectedTokens.toLocaleString()} tokens)
              </span>
            </div>

            {/* Duplicate notice if any selected conversations are already attached */}
            {duplicateSelectedCount > 0 && (
              <div className="flex items-center justify-between p-3 rounded bg-color-warning/10 border border-color-warning/40 text-xs">
                <div className="flex items-center gap-2 text-color-warning">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {duplicateSelectedCount} of the selected conversations{' '}
                    {duplicateSelectedCount === 1 ? 'is' : 'are'} already attached to this project.
                  </span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer text-text-primary font-medium min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="rounded border-border-subtle text-accent-brass focus:ring-accent-brass w-4 h-4"
                  />
                  <span>Skip duplicates</span>
                </label>
              </div>
            )}

            {/* Conversation rows */}
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredSummaries.length === 0 ? (
                <div className="p-8 text-center text-xs text-text-muted">
                  No conversations match your filter.
                </div>
              ) : (
                filteredSummaries.map((summary) => {
                  const isChecked = selectedIds.has(summary.id);
                  const isAlreadyAttached = existingIdSet.has(summary.id);

                  return (
                    <div
                      key={summary.id}
                      onClick={() => toggleSelect(summary.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer select-none ${
                        isChecked
                          ? 'border-accent-brass/80 bg-accent-brass/5'
                          : 'border-border-subtle bg-bg-surface/50 hover:bg-bg-surface'
                      }`}
                    >
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent div
                          aria-label={`Select ${summary.title}`}
                          className="rounded border-border-subtle text-accent-brass focus:ring-accent-brass w-4 h-4 cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={summary.source === 'chatgpt' ? 'brass' : 'default'}>
                            {summary.source.toUpperCase()}
                          </Badge>
                          <span className="font-medium text-xs text-text-primary truncate">
                            {summary.title}
                          </span>
                          {isAlreadyAttached && (
                            <Badge variant="warning" className="text-[10px] py-0">
                              Already attached
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-text-muted flex-wrap">
                          {summary.createdAt && (
                            <span>{formatDateTime(summary.createdAt)}</span>
                          )}
                          <span>
                            {summary.messageCount}{' '}
                            {summary.messageCount === 1 ? 'message' : 'messages'}
                          </span>
                          <span className="font-mono">
                            ~{summary.tokenEstimate.toLocaleString()} tokens
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
              <span className="text-xs text-text-muted">
                {selectedSummaries.length} selected, ~{totalSelectedTokens.toLocaleString()} tokens
                (estimate)
              </span>

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
                  disabled={selectedSummaries.length === 0 || isAttaching}
                  className="min-h-[44px] min-w-[44px]"
                >
                  {isAttaching ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Attaching...
                    </span>
                  ) : (
                    `Attach selected (${selectedSummaries.length})`
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
