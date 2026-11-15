import React, { useState, useRef, useEffect } from 'react';
import {
  type ConversationTurn,
  flipRole,
  splitTurn,
  mergeWithNext,
  removeTurn,
  turnTokenEstimate,
  conversationTokenEstimate,
} from '../domain';
import { formatTokenEstimate } from '../domain/tokens';
import { Badge } from './Badge';
import { Button } from './Button';
import { ArrowLeftRight, Scissors, GitMerge, Trash2 } from 'lucide-react';

export interface ConversationViewerProps {
  turns: ConversationTurn[];
  onChange?: (turns: ConversationTurn[]) => void;
  readOnly?: boolean;
  className?: string;
}

export function ConversationViewer({
  turns,
  onChange,
  readOnly = false,
  className = '',
}: ConversationViewerProps): React.ReactElement {
  const [cursorOffsets, setCursorOffsets] = useState<Record<string, number>>({});
  const [splitErrors, setSplitErrors] = useState<Record<string, string>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const totalTokens = conversationTokenEstimate(turns);

  useEffect(() => {
    const handleDocSelectionChange = () => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement) {
        for (const [id, el] of Object.entries(textareaRefs.current)) {
          if (el === active) {
            setCursorOffsets((prev) => {
              if (prev[id] === active.selectionStart) return prev;
              return { ...prev, [id]: active.selectionStart };
            });
            break;
          }
        }
      }
    };
    document.addEventListener('selectionchange', handleDocSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleDocSelectionChange);
    };
  }, []);

  const handleCursorTracking = (turnId: string, e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    const offset = target.selectionStart;
    setCursorOffsets((prev) => ({ ...prev, [turnId]: offset }));
    if (splitErrors[turnId]) {
      setSplitErrors((prev) => {
        const next = { ...prev };
        delete next[turnId];
        return next;
      });
    }
  };

  const handleTextChange = (index: number, newText: string) => {
    if (!onChange || readOnly) return;
    const next = turns.map((t, i) => (i === index ? { ...t, text: newText } : { ...t }));
    onChange(next);
  };

  const handleFlip = (index: number) => {
    if (!onChange || readOnly) return;
    onChange(flipRole(turns, index));
  };

  const handleSplit = (index: number, turn: ConversationTurn) => {
    if (!onChange || readOnly) return;
    const textarea = textareaRefs.current[turn.id];
    const offset = textarea ? textarea.selectionStart : (cursorOffsets[turn.id] ?? -1);

    if (offset <= 0 || offset >= turn.text.length) {
      setSplitErrors((prev) => ({
        ...prev,
        [turn.id]: 'Place the cursor inside the message where it should split.',
      }));
      return;
    }

    const next = splitTurn(turns, index, offset);
    if (next.length === turns.length) {
      // Split was rejected because one of the halves was empty after trim
      setSplitErrors((prev) => ({
        ...prev,
        [turn.id]: 'Place the cursor inside the message where it should split.',
      }));
      return;
    }

    setSplitErrors((prev) => {
      const copy = { ...prev };
      delete copy[turn.id];
      return copy;
    });
    onChange(next);
  };

  const handleMergeWithNext = (index: number) => {
    if (!onChange || readOnly || index >= turns.length - 1) return;
    onChange(mergeWithNext(turns, index));
  };

  const handleDelete = (index: number) => {
    if (!onChange || readOnly) return;
    onChange(removeTurn(turns, index));
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header with summary and total token count */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle/80 text-sm">
        <span className="font-medium text-text-primary">
          {turns.length} {turns.length === 1 ? 'message' : 'messages'}
        </span>
        <span className="font-mono text-xs text-text-muted">
          {formatTokenEstimate(totalTokens)}
        </span>
      </div>

      {/* Messages list */}
      <div className="flex flex-col gap-3">
        {turns.map((turn, index) => {
          const isLast = index === turns.length - 1;
          const turnTokens = turnTokenEstimate(turn);
          const currentOffset = cursorOffsets[turn.id] ?? 0;
          const isSplitDisabled =
            readOnly ||
            turn.text.length === 0 ||
            currentOffset <= 0 ||
            currentOffset >= turn.text.length;
          const splitError = splitErrors[turn.id];

          return (
            <div
              key={turn.id}
              role="group"
              aria-label={`Message ${index + 1}`}
              className="p-3.5 rounded-lg border border-border-subtle bg-bg-surface/80 flex flex-col gap-2.5"
            >
              {/* Turn header: badge, label, tokens */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant={turn.role === 'user' ? 'brass' : 'default'}>
                    {turn.role.toUpperCase()}
                  </Badge>
                  <span className="text-xs font-medium text-text-muted">
                    Message {index + 1}
                  </span>
                </div>
                <span className="font-mono text-xs text-text-muted">
                  {formatTokenEstimate(turnTokens)}
                </span>
              </div>

              {/* Turn Text Content */}
              {readOnly ? (
                <div className="text-sm font-sans text-text-primary whitespace-pre-wrap leading-relaxed py-1 px-2 rounded bg-bg-app/50 border border-border-subtle/40">
                  {turn.text}
                </div>
              ) : (
                <textarea
                  ref={(el) => {
                    textareaRefs.current[turn.id] = el;
                  }}
                  rows={Math.min(10, Math.max(3, turn.text.split('\n').length))}
                  value={turn.text}
                  onChange={(e) => handleTextChange(index, e.target.value)}
                  onSelect={(e) => handleCursorTracking(turn.id, e)}
                  onClick={(e) => handleCursorTracking(turn.id, e)}
                  onKeyUp={(e) => handleCursorTracking(turn.id, e)}
                  onKeyDown={(e) => handleCursorTracking(turn.id, e)}
                  onPointerUp={(e) => handleCursorTracking(turn.id, e)}
                  onInput={(e) => handleCursorTracking(turn.id, e)}
                  aria-label={`Message ${index + 1} content`}
                  className="w-full text-sm font-sans text-text-primary bg-bg-app/80 border border-border-subtle rounded-md p-2.5 focus:outline-none focus:ring-1 focus:ring-accent-brass resize-y leading-relaxed"
                />
              )}

              {/* Inline split error message */}
              {splitError && (
                <div
                  role="alert"
                  className="text-xs text-color-danger font-medium px-1"
                >
                  {splitError}
                </div>
              )}

              {/* Controls per turn (all 44px min touch target, keyboard accessible, no hover-only) */}
              {!readOnly && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-border-subtle/40">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFlip(index)}
                    aria-label={`Flip role for Message ${index + 1}`}
                    title="Flip role between User and Assistant"
                    className="min-h-[44px] min-w-[44px] gap-1 text-xs"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Flip role</span>
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSplit(index, turn)}
                    disabled={isSplitDisabled}
                    aria-label={`Split Message ${index + 1}`}
                    title="Split message at cursor position"
                    className="min-h-[44px] min-w-[44px] gap-1 text-xs"
                  >
                    <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Split</span>
                  </Button>

                  {!isLast && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMergeWithNext(index)}
                      aria-label={`Merge Message ${index + 1} with next`}
                      title="Merge this message with the next message"
                      className="min-h-[44px] min-w-[44px] gap-1 text-xs"
                    >
                      <GitMerge className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Merge with next</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete Message ${index + 1}`}
                    title="Delete this message"
                    className="min-h-[44px] min-w-[44px] gap-1 text-xs text-text-muted hover:text-color-danger ml-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Delete</span>
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
