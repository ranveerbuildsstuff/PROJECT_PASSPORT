import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { ConversationViewer } from './ConversationViewer';
import { parsePastedConversation } from '../import';
import { type ConversationTurn, type ConversationSource } from '../domain';
import { addPastedConversation, describeStorageError } from '../storage';
import { useToast } from './useToast';
import { Info, AlertCircle } from 'lucide-react';

export interface PasteConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess?: (conversationId: string) => void;
}

export function PasteConversationDialog({
  isOpen,
  onClose,
  projectId,
  onSuccess,
}: PasteConversationDialogProps): React.ReactElement {
  const { showToast } = useToast();

  const [step, setStep] = useState<'paste' | 'review'>('paste');
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);

  const [parsedTurns, setParsedTurns] = useState<ConversationTurn[]>([]);
  const [detectedSource, setDetectedSource] = useState<ConversationSource>('paste');
  const [parseNotes, setParseNotes] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const resetForm = () => {
    setStep('paste');
    setTitle('');
    setRawText('');
    setIsParsing(false);
    setIsAttaching(false);
    setParsedTurns([]);
    setDetectedSource('paste');
    setParseNotes([]);
    setParseError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleParse = () => {
    setParseError(null);
    setIsParsing(true);

    try {
      const result = parsePastedConversation(rawText);
      if (!result.ok) {
        setParseError(result.message);
        setIsParsing(false);
        return;
      }

      setParsedTurns(result.turns);
      setDetectedSource(result.source);
      setParseNotes(result.notes);
      if (!title.trim()) {
        const defaultTitle =
          result.source !== 'paste'
            ? `${result.source.charAt(0).toUpperCase() + result.source.slice(1)} conversation`
            : 'Pasted conversation';
        setTitle(defaultTitle);
      }
      setStep('review');
    } finally {
      setIsParsing(false);
    }
  };

  const handleAttach = async () => {
    if (parsedTurns.length === 0) return;
    setIsAttaching(true);
    setParseError(null);

    const finalTitle = title.trim() || 'Pasted conversation';

    try {
      const conversationId = await addPastedConversation(projectId, {
        title: finalTitle,
        source: detectedSource,
        turns: parsedTurns,
        included: true,
      });

      showToast(
        `Attached "${finalTitle}" (${parsedTurns.length} ${
          parsedTurns.length === 1 ? 'message' : 'messages'
        }).`,
        'success'
      );

      handleClose();
      if (onSuccess) {
        onSuccess(conversationId);
      }
    } catch (err) {
      setParseError(describeStorageError(err));
    } finally {
      setIsAttaching(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'paste' ? 'Paste conversation' : 'Review parsed conversation'}
      description={
        step === 'paste'
          ? 'Paste a chat transcript from ChatGPT, Claude, Gemini or any other AI assistant.'
          : 'Check speaker roles and boundaries before attaching this conversation to your project.'
      }
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-5">
        {/* Error banner */}
        {parseError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg border border-color-danger bg-color-danger/10 text-text-primary flex items-start gap-2.5 text-sm"
          >
            <AlertCircle className="w-5 h-5 text-color-danger shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-color-danger">Could not process paste</span>
              <p className="text-text-muted leading-relaxed">{parseError}</p>
            </div>
          </div>
        )}

        {step === 'paste' ? (
          /* Step 1: Input text */
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="paste-conversation-title"
                className="text-xs font-semibold text-text-primary uppercase tracking-wider"
              >
                Conversation Title
              </label>
              <input
                id="paste-conversation-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Conversation title (optional)"
                className="w-full text-sm font-sans text-text-primary bg-bg-app border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-brass"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="paste-conversation-content"
                className="text-xs font-semibold text-text-primary uppercase tracking-wider"
              >
                Transcript Content
              </label>
              <textarea
                id="paste-conversation-content"
                rows={8}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  if (parseError) setParseError(null);
                }}
                placeholder="Paste conversation transcript here (e.g. ChatGPT, Claude, Gemini, or plain text)..."
                className="w-full text-sm font-sans text-text-primary bg-bg-app border border-border-subtle rounded-md p-3 focus:outline-none focus:ring-1 focus:ring-accent-brass resize-y leading-relaxed font-mono"
              />
            </div>

            {/* Actions: One brass primary button */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-subtle/60">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRawText('');
                  setTitle('');
                  setParseError(null);
                }}
                disabled={!rawText && !title}
                className="min-h-[44px]"
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleParse}
                disabled={isParsing}
                className="min-h-[44px]"
              >
                {isParsing ? 'Parsing...' : 'Parse'}
              </Button>
            </div>
          </div>
        ) : (
          /* Step 2: Review viewer */
          <div className="flex flex-col gap-4">
            {/* Title editor */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="review-conversation-title"
                className="text-xs font-semibold text-text-primary uppercase tracking-wider"
              >
                Conversation Title
              </label>
              <input
                id="review-conversation-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Conversation title"
                className="w-full text-sm font-sans text-text-primary bg-bg-app border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-brass"
              />
            </div>

            {/* Notes from parser if any */}
            {parseNotes.length > 0 && (
              <div
                role="status"
                className="p-3 rounded-lg border border-border-subtle bg-bg-app text-xs text-text-muted flex flex-col gap-1"
              >
                {parseNotes.map((note, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-accent-brass shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Conversation Viewer */}
            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <ConversationViewer
                turns={parsedTurns}
                onChange={setParsedTurns}
              />
            </div>

            {/* Actions: One brass primary button ("Attach to project") */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-subtle/60 flex-wrap">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setStep('paste')}
                className="min-h-[44px]"
              >
                Edit raw paste
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleAttach}
                disabled={isAttaching || parsedTurns.length === 0}
                className="min-h-[44px]"
              >
                {isAttaching ? 'Attaching...' : 'Attach to project'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
