import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Copy, Sparkles, CheckCircle2, AlertCircle, RefreshCw, GitMerge, RotateCcw } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { ProgressRing } from './ProgressRing';
import { useToast } from './useToast';
import { generateCapturePrompt } from '../export/prompts';
import { processPasteBack, type PasteBackResult } from '../import/pasteBack';
import {
  estimateTokens,
  type PassportV1,
  type MergeSectionId,
  type MergeAction,
  type MergeChoices,
  mergePassport,
  calculateSectionDiff,
  createEmptyPassport,
} from '../domain';
import {
  applyMergeWithCheckpoint,
  restoreCheckpoint,
  describeStorageError,
  StaleWrite,
  getPassport,
  getProject,
} from '../storage';
import { flushActiveAutosave } from '../lib';

export interface CaptureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  currentPassport?: PassportV1 | null;
  onMergeComplete?: (checkpointId: string) => void;
}

const SECTION_LABELS: Record<MergeSectionId, string> = {
  basics: 'Basics',
  stack: 'Tech stack',
  requirements: 'Requirements',
  decisions: 'Decisions',
  completed: 'Completed',
  tasks: 'Tasks',
  bugs: 'Bugs',
  instructions: 'Instructions',
  nextAction: 'Next action',
  openQuestions: 'Open questions',
};

export function CaptureDialog({
  isOpen,
  onClose,
  projectId,
  currentPassport: initialCurrentPassport,
  onMergeComplete,
}: CaptureDialogProps): React.ReactElement {
  const [pastedText, setPastedText] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<PasteBackResult | null>(null);

  // Active passport for comparison (either passed in or reloaded upon conflict)
  const [activePassport, setActivePassport] = useState<PassportV1>(
    initialCurrentPassport || createEmptyPassport('Project')
  );

  useEffect(() => {
    if (initialCurrentPassport) {
      setActivePassport(initialCurrentPassport);
    }
  }, [initialCurrentPassport]);

  // Section-by-section merge choices
  const [mergeChoices, setMergeChoices] = useState<MergeChoices>({});
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [isStaleError, setIsStaleError] = useState(false);

  const promptBoxRef = useRef<HTMLPreElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const { showToast } = useToast();

  const promptText = useMemo(() => generateCapturePrompt(), []);
  const tokenEstimate = useMemo(() => estimateTokens(promptText), [promptText]);

  // Initialize choices when result changes
  useEffect(() => {
    if (result && result.status === 'ok') {
      const initialChoices: MergeChoices = {};
      for (const s of result.presentSections) {
        initialChoices[s] = s === 'nextAction' ? 'replace' : 'merge';
      }
      setMergeChoices(initialChoices);
      setMergeError(null);
      setIsStaleError(false);
    }
  }, [result]);

  const handleCopyPrompt = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(promptText);
        showToast('Capture prompt copied to clipboard', 'success');
        return;
      }
      throw new Error('Clipboard API unavailable');
    } catch {
      if (promptBoxRef.current) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(promptBoxRef.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      showToast('Couldn’t copy automatically. The prompt is selected: press Ctrl+C.', 'warning');
    }
  };

  const handleCheckReply = () => {
    setIsChecking(true);
    setMergeError(null);
    setIsStaleError(false);
    setTimeout(() => {
      const res = processPasteBack(pastedText);
      setResult(res);
      setIsChecking(false);
      setTimeout(() => {
        resultHeadingRef.current?.focus();
      }, 50);
    }, 50);
  };

  const handleClear = () => {
    setPastedText('');
    setResult(null);
    setMergeChoices({});
    setMergeError(null);
    setIsStaleError(false);
  };

  const handleChoiceChange = (sectionId: MergeSectionId, action: MergeAction) => {
    setMergeChoices((prev) => ({
      ...prev,
      [sectionId]: action,
    }));
  };

  const handleApplyMerge = async () => {
    if (!projectId || !result || result.status !== 'ok') return;

    setIsMerging(true);
    setMergeError(null);
    setIsStaleError(false);

    try {
      const mergedPassport = mergePassport(activePassport, result.sections, mergeChoices);

      const res = await applyMergeWithCheckpoint({
        projectId,
        expectedUpdatedAt: activePassport.project.updatedAt,
        mergedPassport,
        checkpointDescription: 'Before AI merge',
      });

      const checkpointId = res.checkpointId;
      const postMergeUpdatedAt = res.updatedPassport.project.updatedAt;
      onMergeComplete?.(checkpointId);
      onClose();

      const mergedCount = result.presentSections.filter(
        (s) => (mergeChoices[s] ?? (s === 'nextAction' ? 'replace' : 'merge')) !== 'skip'
      ).length;

      showToast(
        `Merged ${mergedCount} ${mergedCount === 1 ? 'section' : 'sections'} into passport.`,
        'success',
        undefined,
        {
          label: 'Undo',
          onClick: async () => {
            try {
              // Flush any pending in-memory autosave edits first so newer edits are not discarded
              await flushActiveAutosave();
              const currentPass = await getPassport(projectId);
              const hasNewerEdits = currentPass && currentPass.project.updatedAt !== postMergeUpdatedAt;
              await restoreCheckpoint(checkpointId);
              if (hasNewerEdits) {
                showToast('Merge undone. Newer edits saved in a "Before restore" checkpoint.', 'info');
              } else {
                showToast('Merge undone.', 'info');
              }
            } catch (err) {
              showToast(describeStorageError(err), 'error');
            }
          },
        }
      );
    } catch (err) {
      if (err instanceof StaleWrite || (err as { name?: string })?.name === 'StaleWrite') {
        setIsStaleError(true);
        setMergeError(describeStorageError(err));
      } else {
        setMergeError(describeStorageError(err));
      }
    } finally {
      setIsMerging(false);
    }
  };

  const handleReloadLatest = async () => {
    if (!projectId) return;
    try {
      const [latestProj, latestPass] = await Promise.all([
        getProject(projectId),
        getPassport(projectId),
      ]);
      if (latestPass) {
        if (latestProj) {
          latestPass.project.updatedAt = latestProj.updatedAt;
          latestPass.project.name = latestProj.name;
          latestPass.project.status = latestProj.status;
        }
        setActivePassport(latestPass);
        setMergeError(null);
        setIsStaleError(false);
        showToast('Reloaded latest passport version from storage.', 'info');
      }
    } catch (err) {
      setMergeError(describeStorageError(err));
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Capture from AI"
      description="Extract a structured passport snapshot from your current AI conversation."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-6 text-sm text-text-primary">
        {/* Step 1: Copy Prompt */}
        <section aria-labelledby="step-1-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 id="step-1-heading" className="text-base font-semibold text-text-primary flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-brass/20 text-accent-brass font-mono text-xs font-bold">
                1
              </span>
              <span>Copy this prompt</span>
            </h3>
            <span className="text-xs font-mono text-text-muted">
              ~{tokenEstimate.toLocaleString()} tokens (estimate)
            </span>
          </div>

          <p className="text-xs text-text-muted">
            Paste this prompt into your existing ChatGPT, Claude, Gemini, or coding agent conversation.
          </p>

          <pre
            ref={promptBoxRef}
            tabIndex={0}
            aria-label="Capture prompt text"
            className="p-3.5 rounded-lg border border-border-subtle bg-bg-app font-mono text-xs text-text-muted max-h-44 overflow-y-auto whitespace-pre-wrap select-all focus:outline-none focus:ring-2 focus:ring-accent-brass"
          >
            {promptText}
          </pre>

          <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
            <Button
              type="button"
              variant="primary"
              onClick={handleCopyPrompt}
              className="gap-2 min-h-[44px]"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              <span>Copy prompt</span>
            </Button>
            <span className="text-xs text-text-muted italic">
              Your conversation stays in that AI. This app never connects to it.
            </span>
          </div>
        </section>

        <hr className="border-border-subtle/60" />

        {/* Step 2: Paste Reply */}
        <section aria-labelledby="step-2-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="step-2-heading" className="text-base font-semibold text-text-primary flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-accent-brass/20 text-accent-brass font-mono text-xs font-bold">
                2
              </span>
              <span>Paste the AI’s reply</span>
            </h3>
          </div>

          <p className="text-xs text-text-muted">
            Paste the markdown code block or JSON object returned by the AI.
          </p>

          <textarea
            rows={8}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste the AI's response here..."
            aria-label="Paste AI response"
            className="w-full p-3 rounded-lg border border-border-subtle bg-bg-app font-mono text-xs text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent-brass min-h-[140px]"
          />

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              onClick={handleCheckReply}
              disabled={isChecking}
              isLoading={isChecking}
              className="gap-2 min-h-[44px]"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>Check reply</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={handleClear}
              disabled={!pastedText && !result}
              className="min-h-[44px]"
            >
              <span>Clear</span>
            </Button>
          </div>
        </section>

        {/* Results Area */}
        {result && (
          <section aria-label="Verification result" className="pt-2">
            {result.status === 'ok' ? (
              <div
                role="status"
                aria-live="polite"
                className="p-4 rounded-lg border border-color-success/40 bg-color-success/10 flex flex-col gap-4 text-text-primary"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-color-success shrink-0" aria-hidden="true" />
                    <div>
                      <h4
                        ref={resultHeadingRef}
                        tabIndex={-1}
                        className="text-base font-semibold text-text-primary outline-none"
                      >
                        Passport reply verified
                      </h4>
                      <p className="text-xs text-text-muted mt-0.5">
                        Found {result.presentSections.length} valid passport sections. Choose how to merge each section below.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-2 rounded border border-border-subtle bg-bg-surface">
                    <ProgressRing value={result.incomingReadiness} size={44} strokeWidth={4} />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                        Reply readiness
                      </span>
                      <span className="text-sm font-bold font-mono text-text-primary">
                        {result.incomingReadiness}/100
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section-by-section Merge Controls & Diff Summary */}
                <div className="flex flex-col gap-2.5 pt-2">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                    <GitMerge className="w-3.5 h-3.5 text-accent-brass" aria-hidden="true" />
                    <span>Section-by-section merge</span>
                  </h5>

                  <div className="flex flex-col gap-2">
                    {result.presentSections.map((secId) => {
                      const choice = mergeChoices[secId] ?? (secId === 'nextAction' ? 'replace' : 'merge');
                      const diff = calculateSectionDiff(secId, activePassport, result.sections, choice);
                      const allowedActions: MergeAction[] =
                        secId === 'nextAction' ? ['replace', 'skip'] : ['merge', 'replace', 'skip'];

                      return (
                        <div
                          key={secId}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-border-subtle bg-bg-surface"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-text-primary">
                              {SECTION_LABELS[secId]}
                            </span>
                            <span className="text-xs font-mono text-text-muted">
                              {diff.summary}
                            </span>
                          </div>

                          <div
                            role="group"
                            aria-label={`Merge action for ${SECTION_LABELS[secId]}`}
                            className="flex items-center gap-1 bg-bg-app p-1 rounded-lg border border-border-subtle shrink-0"
                          >
                            {allowedActions.map((action) => {
                              const isSelected = choice === action;
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  onClick={() => handleChoiceChange(secId, action)}
                                  className={`min-h-[44px] min-w-[64px] px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass cursor-pointer ${
                                    isSelected
                                      ? 'bg-accent-brass text-bg-app font-semibold shadow-sm'
                                      : 'text-text-muted hover:text-text-primary hover:bg-bg-surface'
                                  }`}
                                >
                                  {action}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Repairs feedback */}
                {result.repairs.length > 0 && (
                  <div className="text-xs text-text-muted pt-1">
                    <span className="font-medium text-text-primary">Repairs applied: </span>
                    {result.repairs.map((r) => `${r.description} (${r.count})`).join(', ')}.
                  </div>
                )}

                {/* Ignored keys feedback */}
                {result.ignored.length > 0 && (
                  <div className="text-xs text-text-muted">
                    <span className="font-medium text-text-primary">Ignored items: </span>
                    {result.ignored.join(', ')}.
                  </div>
                )}

                {/* Notes feedback */}
                {result.notes.length > 0 && (
                  <div className="text-xs text-text-muted">
                    <span className="font-medium text-text-primary">Notes: </span>
                    {result.notes.join(', ')}.
                  </div>
                )}

                {/* Storage or Stale Conflict Error */}
                {mergeError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="p-3 rounded-lg border border-color-danger/40 bg-color-danger/10 text-color-danger text-xs flex items-center justify-between gap-3 flex-wrap"
                  >
                    <span className="font-medium">{mergeError}</span>
                    {isStaleError && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleReloadLatest}
                        className="gap-1 min-h-[44px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Reload latest</span>
                      </Button>
                    )}
                  </div>
                )}

                {/* Merge Action Footer */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border-subtle/60 flex-wrap">
                  <span className="text-xs text-text-muted">
                    An automatic backup checkpoint is created before writing.
                  </span>

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleApplyMerge}
                      disabled={isMerging}
                      isLoading={isMerging}
                      className="gap-2 min-h-[44px]"
                    >
                      <GitMerge className="w-4 h-4" aria-hidden="true" />
                      <span>Apply merge</span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="alert"
                aria-live="assertive"
                className="p-4 rounded-lg border border-color-danger/40 bg-color-danger/10 flex flex-col gap-3 text-text-primary"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-color-danger shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="flex flex-col gap-1 w-full">
                    <h4
                      ref={resultHeadingRef}
                      tabIndex={-1}
                      className="text-base font-semibold text-color-danger outline-none"
                    >
                      {result.title}
                    </h4>
                    <p className="text-sm text-text-primary font-medium">
                      {result.message}
                    </p>
                    <p className="text-xs text-text-muted">
                      {result.nextStep}
                    </p>

                    {result.details && result.details.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-text-muted font-mono bg-bg-app p-2.5 rounded border border-border-subtle max-h-36 overflow-y-auto">
                        {result.details.map((detail, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {detail}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyPrompt}
                    className="gap-1.5 min-h-[44px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Copy prompt again</span>
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
