import React, { useState, useEffect, useRef } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import {
  generateReconstructPrompt,
  DEFAULT_RECONSTRUCT_TOKEN_CAP,
  type ReconstructPromptResult,
} from '../export/prompts';
import {
  type PassportV1,
  type ConversationTurn,
  conversationTokenEstimate,
} from '../domain';
import { formatTokenEstimate } from '../domain/tokens';
import { getConversation, recordToTurns } from '../storage';
import { useToast } from './useToast';
import { Copy, AlertTriangle, Info, Check } from 'lucide-react';

export interface ReconstructPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  passport: PassportV1;
  tokenCap?: number;
}

export function ReconstructPromptDialog({
  isOpen,
  onClose,
  passport,
  tokenCap = DEFAULT_RECONSTRUCT_TOKEN_CAP,
}: ReconstructPromptDialogProps): React.ReactElement {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [reconstructResult, setReconstructResult] = useState<ReconstructPromptResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load included conversation turns whenever the dialog opens
  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setClipboardError(null);
      return;
    }

    let isMounted = true;
    async function loadTurns() {
      setIsLoading(true);
      try {
        const includedRefs = (passport.conversations || []).filter((c) => c.included);
        const allTurns: ConversationTurn[] = [];

        for (const ref of includedRefs) {
          const record = await getConversation(ref.id);
          if (record) {
            allTurns.push(...recordToTurns(record));
          }
        }

        if (isMounted) {
          setTurns(allTurns);
          const result = generateReconstructPrompt(allTurns, { tokenCap });
          setReconstructResult(result);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadTurns();

    return () => {
      isMounted = false;
    };
  }, [isOpen, passport.conversations, tokenCap]);

  const totalTokens = conversationTokenEstimate(turns);
  const hasIncludedConversations = (passport.conversations || []).some((c) => c.included);

  const handleCopy = async () => {
    if (!reconstructResult) return;
    setClipboardError(null);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(reconstructResult.prompt);
        setCopied(true);
        showToast('Copied reconstruct prompt to clipboard.', 'success');
        setTimeout(() => setCopied(false), 3000);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      // Fallback: select text in textarea
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
      setClipboardError("Couldn't copy automatically. The prompt is selected: press Ctrl+C.");
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Reconstruct passport"
      description="Generate a reconstruct prompt from attached conversation turns to rebuild passport JSON using any AI model."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-5">
        {/* Loading state */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-text-muted">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-border-subtle border-t-accent-brass" />
            <span className="text-sm">Preparing reconstruct prompt...</span>
          </div>
        ) : !hasIncludedConversations || turns.length === 0 ? (
          /* Empty / Nothing included warning */
          <div
            role="alert"
            className="p-4 rounded-lg border border-border-subtle bg-bg-app text-sm text-text-muted flex items-center gap-3"
          >
            <Info className="w-5 h-5 text-accent-brass shrink-0" aria-hidden="true" />
            <span>Include at least one conversation to build the prompt.</span>
          </div>
        ) : (
          /* Content state */
          <div className="flex flex-col gap-4">
            {/* Header info / Cap warning */}
            <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-text-muted pb-2 border-b border-border-subtle/60">
              <div className="flex items-center gap-2">
                <span>Cap: {formatTokenEstimate(tokenCap)}</span>
                <span>•</span>
                <span>Included: {reconstructResult?.includedTurns ?? 0}</span>
                <span>•</span>
                <span>Omitted: {reconstructResult?.omittedTurns ?? 0}</span>
              </div>
              <span className="font-mono text-xs">
                Prompt size: {formatTokenEstimate(reconstructResult?.estimatedTokens ?? 0)}
              </span>
            </div>

            {/* Cap trim warning if oldest turns were omitted */}
            {reconstructResult && reconstructResult.omittedTurns > 0 && (
              <div
                role="status"
                className="p-3.5 rounded-lg border border-color-warning/40 bg-color-warning/10 text-xs text-text-primary flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-color-warning shrink-0 mt-0.5" aria-hidden="true" />
                <span className="leading-relaxed">
                  This conversation is about {totalTokens.toLocaleString()} tokens (estimate), over the
                  cap of {tokenCap.toLocaleString()}. The oldest {reconstructResult.omittedTurns}{' '}
                  {reconstructResult.omittedTurns === 1 ? 'message was' : 'messages were'} left out of the
                  prompt.
                </span>
              </div>
            )}

            {/* Guidance copy */}
            <p className="text-xs text-text-muted leading-relaxed">
              Copy this prompt and paste it into ChatGPT, Claude, Gemini or your preferred AI to
              reconstruct your passport. Then paste the AI’s reply back into{' '}
              <strong className="text-text-primary font-medium">Capture from AI</strong> on the Passport
              tab.
            </p>

            {/* Prompt preview */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="reconstruct-prompt-textarea"
                className="text-xs font-semibold text-text-primary uppercase tracking-wider"
              >
                Reconstruct Prompt Preview
              </label>
              <textarea
                ref={textareaRef}
                id="reconstruct-prompt-textarea"
                readOnly
                rows={10}
                value={reconstructResult?.prompt ?? ''}
                className="w-full text-xs font-mono text-text-primary bg-bg-app border border-border-subtle rounded-md p-3 focus:outline-none focus:ring-1 focus:ring-accent-brass resize-y leading-relaxed select-all"
              />
            </div>

            {/* Clipboard error message if copy failed */}
            {clipboardError && (
              <div
                role="alert"
                className="text-xs text-color-warning font-medium px-1"
              >
                {clipboardError}
              </div>
            )}

            {/* Action footer: Only one brass primary */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-subtle/60 flex-wrap">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="min-h-[44px]"
              >
                Close
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleCopy}
                disabled={!reconstructResult}
                className="min-h-[44px] gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-color-success" aria-hidden="true" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" aria-hidden="true" />
                    <span>Copy prompt</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
