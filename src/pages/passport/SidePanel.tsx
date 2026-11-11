import React, { useState } from 'react';
import { Copy, Check, FileText, ChevronDown } from 'lucide-react';
import type { PassportV1 } from '../../domain';
import { computeReadiness, passportToMarkdown, estimateTokens } from '../../domain';
import { ProgressRing, Badge, Button, useToast, Card } from '../../ui';

export interface SidePanelProps {
  draft: PassportV1;
  className?: string;
}

export function SidePanel({ draft, className = '' }: SidePanelProps): React.ReactElement {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isReadinessOpenMobile, setIsReadinessOpenMobile] = useState(true);
  const [isPreviewOpenMobile, setIsPreviewOpenMobile] = useState(true);

  const readiness = computeReadiness(draft);
  const markdown = passportToMarkdown(draft);
  const tokens = estimateTokens(markdown);

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        showToast('Clipboard is not available in this environment', 'error');
        return;
      }
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      showToast('Markdown copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy markdown to clipboard', 'error');
    }
  };

  return (
    <aside className={`flex flex-col gap-6 ${className}`}>
      {/* 1. Readiness Card */}
      <Card className="p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ProgressRing value={readiness.score} size={48} strokeWidth={4.5} />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Handoff Readiness</h2>
              <span className="text-xs font-mono text-text-muted">
                {readiness.score}/100 score
              </span>
            </div>
          </div>
          {/* Mobile toggle button */}
          <button
            type="button"
            onClick={() => setIsReadinessOpenMobile(!isReadinessOpenMobile)}
            className="lg:hidden p-2 text-text-muted hover:text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
            aria-label="Toggle readiness checklist"
            aria-expanded={isReadinessOpenMobile}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${isReadinessOpenMobile ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div className={`flex flex-col gap-2 ${isReadinessOpenMobile ? 'block' : 'hidden lg:flex'}`}>
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
            7 Readiness Checks
          </span>
          <ul className="flex flex-col gap-1.5 text-xs">
            {readiness.checks.map((check) => (
              <li
                key={check.id}
                className="flex items-center justify-between py-1 border-b border-border-subtle/50 last:border-0"
              >
                <span
                  className={check.passed ? 'text-text-primary font-medium' : 'text-text-muted'}
                >
                  {check.label}
                </span>
                <Badge variant={check.passed ? 'success' : 'default'}>
                  {check.passed ? 'PASS' : 'INCOMPLETE'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {/* 2. Live Markdown Preview Card */}
      <Card className="p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-brass" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">PROJECT_STATE.md</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5"
              aria-label="Copy markdown"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-color-success" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </Button>
            {/* Mobile toggle button */}
            <button
              type="button"
              onClick={() => setIsPreviewOpenMobile(!isPreviewOpenMobile)}
              className="lg:hidden p-2 text-text-muted hover:text-text-primary min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
              aria-label="Toggle markdown preview"
              aria-expanded={isPreviewOpenMobile}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isPreviewOpenMobile ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        <div className={`flex flex-col gap-2 ${isPreviewOpenMobile ? 'block' : 'hidden lg:flex'}`}>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-mono text-[11px]">
              ~{tokens.toLocaleString()} tokens <span className="text-text-muted">(estimate)</span>
            </span>
          </div>

          <div className="relative rounded-lg border border-border-subtle bg-bg-app p-3 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed text-text-primary whitespace-pre-wrap select-all">
            {markdown}
          </div>
        </div>
      </Card>
    </aside>
  );
}
