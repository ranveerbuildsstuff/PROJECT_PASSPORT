import React, { useState, useRef, useMemo } from 'react';
import { Copy, Sparkles, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { ProgressRing } from './ProgressRing';
import { useToast } from './useToast';
import { generateCapturePrompt } from '../export/prompts';
import { processPasteBack, type PasteBackResult } from '../import/pasteBack';
import { estimateTokens } from '../domain';

export interface CaptureDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CaptureDialog({ isOpen, onClose }: CaptureDialogProps): React.ReactElement {
  const [pastedText, setPastedText] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<PasteBackResult | null>(null);

  const promptBoxRef = useRef<HTMLPreElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const { showToast } = useToast();

  const promptText = useMemo(() => generateCapturePrompt(), []);
  const tokenEstimate = useMemo(() => estimateTokens(promptText), [promptText]);

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
                        Found {result.presentSections.length} valid passport sections.
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

                {/* Section summary table/list */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Basics</span>
                    <span className="font-semibold text-text-primary">
                      {result.presentSections.includes('basics') ? 'Provided' : 'Omitted'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Stack</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.stack?.length ?? 0} {result.sections.stack?.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Requirements</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.requirements?.length ?? 0} {result.sections.requirements?.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Decisions</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.decisions?.length ?? 0} {result.sections.decisions?.length === 1 ? 'decision' : 'decisions'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Completed</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.completed?.length ?? 0} {result.sections.completed?.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Tasks</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.tasks?.length ?? 0} {result.sections.tasks?.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Bugs</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.bugs?.items.length ?? 0} {result.sections.bugs?.items.length === 1 ? 'bug' : 'bugs'}
                      {result.sections.bugs?.bugsReviewed ? ' (reviewed)' : ''}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Instructions</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.instructions?.length ?? 0} {result.sections.instructions?.length === 1 ? 'rule' : 'rules'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Next action</span>
                    <span className="font-semibold text-text-primary">
                      {result.presentSections.includes('nextAction') ? 'Provided' : 'Omitted'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-bg-surface border border-border-subtle/80 flex flex-col">
                    <span className="text-text-muted">Open questions</span>
                    <span className="font-semibold text-text-primary">
                      {result.sections.openQuestions?.length ?? 0} {result.sections.openQuestions?.length === 1 ? 'item' : 'items'}
                    </span>
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

                <p className="text-xs text-text-muted italic border-t border-border-subtle/60 pt-2">
                  Merging arrives in the next update
                </p>
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
