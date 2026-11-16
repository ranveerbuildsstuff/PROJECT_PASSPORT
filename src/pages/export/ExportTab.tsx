import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Input } from '../../ui/Input';
import { Dialog } from '../../ui/Dialog';
import { Textarea } from '../../ui/Textarea';
import { useToast } from '../../ui/useToast';
import {
  Download,
  Copy,
  AlertTriangle,
  FileArchive,
  Clipboard,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import type { PassportV1 } from '../../domain/passport.schema';
import type { FileRecord, ConversationRecord } from '../../storage/db';
import type { ConversationTurn } from '../../domain/conversation';
import { listFiles, listConversations, recordToTurns } from '../../storage';
import {
  DESTINATION_PRESETS,
  validateCustomBudget,
  type ExportPresetKey,
  type ExportFormat,
} from '../../export/presets';
import { planExport } from '../../export/budgeter';
import { generateContinuePrompt } from '../../export/continuePrompt';
import { evaluateSecretGate } from '../../domain/secretGate';
import { handleExportWorkerMessage } from '../../export/export.worker';
import { detectCapabilities, HASHING_UNAVAILABLE_MESSAGE } from '../../lib/capabilities';

export interface ExportTabProps {
  projectId: string;
  passport: PassportV1;
  onNavigateToPassport?: () => void;
}

export function ExportTab({
  projectId,
  passport,
  onNavigateToPassport,
}: ExportTabProps): React.ReactElement {
  const { showToast } = useToast();
  const capabilities = useMemo(() => detectCapabilities(), []);

  const [files, setFiles] = useState<FileRecord[]>([]);
  const [conversations, setConversations] = useState<
    Array<{ record: ConversationRecord; turns: ConversationTurn[] }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  const [preset, setPreset] = useState<ExportPresetKey>('lite');
  const [customBudgetStr, setCustomBudgetStr] = useState('50000');
  const [format, setFormat] = useState<ExportFormat>('lite');
  const [gateOverride, setGateOverride] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'included' | 'trimmed' | 'omitted'>('all');
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [fallbackModalOpen, setFallbackModalOpen] = useState(false);
  const [fallbackPromptText, setFallbackPromptText] = useState('');
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Load project files and conversations from storage
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const storedFiles = await listFiles(projectId);
        const storedConvs = await listConversations(projectId);
        const convsWithTurns = storedConvs.map((c) => ({
          record: c,
          turns: recordToTurns(c),
        }));
        if (isMounted) {
          setFiles(storedFiles);
          setConversations(convsWithTurns);
          setIsLoading(false);
        }
      } catch {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    void loadData();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Compute active budget
  const budgetValidation = useMemo(() => {
    if (preset === 'custom') {
      return validateCustomBudget(customBudgetStr);
    }
    return { isValid: true, budget: DESTINATION_PRESETS[preset].defaultTokens };
  }, [preset, customBudgetStr]);

  const activeBudget =
    budgetValidation.isValid && budgetValidation.budget
      ? budgetValidation.budget
      : DESTINATION_PRESETS.lite.defaultTokens;

  // Compute live plan and gate
  const plan = useMemo(() => {
    return planExport({ passport, files, conversations }, activeBudget);
  }, [passport, files, conversations, activeBudget]);

  const gateResult = useMemo(() => {
    return evaluateSecretGate({ passport, files, conversations });
  }, [passport, files, conversations]);

  // Empty state check
  const isPassportEmpty =
    !passport.project.name.trim() && !passport.project.goal.trim();

  // Handlers
  const handleCopyPrompt = async () => {
    const promptText = generateContinuePrompt(plan, 'lite');
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(promptText);
        showToast(
          `Handoff prompt copied to clipboard (~${plan.totalEstimatedTokens.toLocaleString()} tokens estimate)`,
          'success'
        );
        return;
      }
      throw new Error('Clipboard API unavailable');
    } catch {
      setFallbackPromptText(promptText);
      setFallbackModalOpen(true);
      showToast('Could not access clipboard. Copy from the text box below.', 'warning');
    }
  };

  const handleDownloadPackage = async () => {
    setIsGeneratingZip(true);
    try {
      const res = await handleExportWorkerMessage({
        action: 'build_zip',
        plan,
      });

      if (res.type === 'zip_success') {
        const blob = new Blob([res.buffer], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast(
          `Exported ${res.filename} (~${Math.round(res.sizeBytes / 1024)} KB)`,
          'success'
        );
      } else {
        showToast(res.message || 'Failed to generate package.', 'error');
      }
    } catch {
      showToast('Failed to build package archive.', 'error');
    } finally {
      setIsGeneratingZip(false);
    }
  };

  // Filtered truncation items
  const displayedItems = useMemo(() => {
    switch (filterTab) {
      case 'included':
        return plan.includedItems;
      case 'trimmed':
        return plan.trimmedItems;
      case 'omitted':
        return plan.omittedItems;
      default:
        return plan.allItems;
    }
  }, [plan, filterTab]);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-text-muted text-sm flex items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        <span>Loading export details...</span>
      </div>
    );
  }

  if (isPassportEmpty) {
    return (
      <Card className="p-8 sm:p-12 text-center max-w-lg mx-auto my-6 border-dashed">
        <div className="w-12 h-12 rounded-full bg-bg-app border border-border-subtle flex items-center justify-center text-accent-brass mx-auto mb-4">
          <Download className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Your project passport is empty
        </h3>
        <p className="text-sm text-text-muted leading-relaxed mb-6">
          Fill in your project name and core goal on the Passport tab before generating a handoff package.
        </p>
        {onNavigateToPassport && (
          <Button
            type="button"
            variant="primary"
            onClick={onNavigateToPassport}
            className="min-h-[44px]"
          >
            Go to Passport tab
          </Button>
        )}
      </Card>
    );
  }

  const isBlocked = gateResult.isBlocked && !gateOverride;

  return (
    <div className="space-y-6">
      {/* Capability warning */}
      {!capabilities.webCryptoSubtle && (
        <div
          role="status"
          aria-label="Security warning"
          className="p-3.5 rounded-lg border border-color-warning/40 bg-color-warning/10 text-xs text-text-primary flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-color-warning shrink-0" aria-hidden="true" />
          <span>{HASHING_UNAVAILABLE_MESSAGE}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-text-primary flex items-center gap-2">
          <Download className="w-5 h-5 text-accent-brass" aria-hidden="true" />
          <span>Export Handoff Package</span>
        </h2>
        <p className="text-xs sm:text-sm text-text-muted mt-1">
          Package project specifications, files, and conversation transcripts within target AI token limits.
        </p>
      </div>

      {/* Preset & Format Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Preset Picker */}
        <Card className="p-4 sm:p-5">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-sm font-semibold">1. Destination Preset</CardTitle>
            <CardDescription className="text-xs">
              Select your target AI assistant to apply recommended token budgets.
            </CardDescription>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(Object.keys(DESTINATION_PRESETS) as ExportPresetKey[]).map((key) => {
              const p = DESTINATION_PRESETS[key];
              const isSelected = preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setPreset(key);
                    if (key !== 'custom') {
                      setFormat(p.recommendedFormat);
                    }
                  }}
                  className={`p-3 rounded-lg border text-left transition-all min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass ${
                    isSelected
                      ? 'border-accent-brass bg-accent-brass/10 ring-1 ring-accent-brass'
                      : 'border-border-subtle bg-bg-app hover:border-border-muted'
                  }`}
                >
                  <div className="text-xs font-semibold text-text-primary">{p.label}</div>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {key === 'custom'
                      ? 'Custom'
                      : `~${p.defaultTokens.toLocaleString()} tokens (estimate)`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Budget Input */}
          {preset === 'custom' && (
            <div className="mt-4 pt-3 border-t border-border-subtle space-y-1.5">
              <label
                htmlFor="custom-budget-input"
                className="block text-xs font-medium text-text-primary"
              >
                Custom budget tokens (estimate):
              </label>
              <Input
                id="custom-budget-input"
                type="text"
                value={customBudgetStr}
                onChange={(e) => setCustomBudgetStr(e.target.value)}
                placeholder="50000"
                className="text-xs"
              />
              {!budgetValidation.isValid && (
                <p className="text-xs text-color-danger mt-1" role="alert">
                  {budgetValidation.error}
                </p>
              )}
              <p className="text-[11px] text-text-muted">
                Accepts between 1,000 and 2,000,000 tokens.
              </p>
            </div>
          )}
        </Card>

        {/* Format Choice */}
        <Card className="p-4 sm:p-5">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="text-sm font-semibold">2. Export Format</CardTitle>
            <CardDescription className="text-xs">
              Choose between a direct clipboard prompt or a full verified package archive.
            </CardDescription>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('lite')}
              className={`p-3.5 rounded-lg border text-left transition-all min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass ${
                format === 'lite'
                  ? 'border-accent-brass bg-accent-brass/10 ring-1 ring-accent-brass'
                  : 'border-border-subtle bg-bg-app hover:border-border-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Clipboard className="w-4 h-4 text-accent-brass" aria-hidden="true" />
                <span className="text-xs font-semibold text-text-primary">Lite prompt</span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Copies a single structured CONTINUE_PROMPT directly to clipboard for pasting into chat windows.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setFormat('full')}
              className={`p-3.5 rounded-lg border text-left transition-all min-h-[44px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass ${
                format === 'full'
                  ? 'border-accent-brass bg-accent-brass/10 ring-1 ring-accent-brass'
                  : 'border-border-subtle bg-bg-app hover:border-border-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <FileArchive className="w-4 h-4 text-accent-brass" aria-hidden="true" />
                <span className="text-xs font-semibold text-text-primary">Full package (.zip)</span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Downloads a verified .zip bundle with project files, transcripts, state summaries, and MANIFEST.json.
              </p>
            </button>
          </div>
        </Card>
      </div>

      {/* Secret Gate Security Banner */}
      {gateResult.isBlocked && (
        <div
          className="p-4 rounded-lg border border-color-danger/30 bg-color-danger/10 text-xs space-y-3"
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-color-danger shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <h4 className="font-semibold text-color-danger text-sm">
                Export blocked: Unresolved secrets detected
              </h4>
              <p className="text-text-muted leading-relaxed">
                {gateResult.summary}
              </p>
            </div>
          </div>

          {/* Masked findings list */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto pl-7">
            {gateResult.unresolvedFindings.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded bg-bg-surface border border-border-subtle text-[11px]"
              >
                <span className="font-mono text-text-primary truncate max-w-xs">{f.location}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="danger">{f.ruleName}</Badge>
                  <span className="font-mono text-text-muted">{f.maskedValue}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Override Checkbox */}
          <div className="flex items-center gap-2 pl-7 pt-1">
            <input
              type="checkbox"
              id="secret-gate-override"
              checked={gateOverride}
              onChange={(e) => setGateOverride(e.target.checked)}
              className="w-4 h-4 rounded border-border-subtle text-accent-brass focus:ring-accent-brass cursor-pointer"
            />
            <label
              htmlFor="secret-gate-override"
              className="font-medium text-text-primary cursor-pointer select-none"
            >
              I understand the risks and want to export anyway (override)
            </label>
          </div>
        </div>
      )}

      {/* Over-budget Warning */}
      {plan.isOverBudget && plan.overBudgetWarning && (
        <div
          className="p-3.5 rounded-lg border border-color-warning/30 bg-color-warning/10 text-xs flex items-start gap-2 text-text-primary"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 text-color-warning shrink-0 mt-0.5" aria-hidden="true" />
          <span>{plan.overBudgetWarning}</span>
        </div>
      )}

      {/* Truncation Inspection Panel */}
      <Card className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              3. Truncation & Priority Inspection
            </h3>
            <p className="text-xs text-text-muted">
              Live priority allocation across all 4 tiers based on target budget.
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-semibold text-text-primary">
              ~{plan.totalEstimatedTokens.toLocaleString()} / {activeBudget.toLocaleString()} tokens (estimate)
            </span>
            <div className="text-[11px] text-text-muted">
              {Math.min(100, Math.round((plan.totalEstimatedTokens / activeBudget) * 100))}% of budget allocated
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant={filterTab === 'all' ? 'primary' : 'outline'}
            onClick={() => setFilterTab('all')}
            className="text-xs min-h-[36px]"
          >
            All ({plan.allItems.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterTab === 'included' ? 'primary' : 'outline'}
            onClick={() => setFilterTab('included')}
            className="text-xs min-h-[36px]"
          >
            Included ({plan.includedItems.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterTab === 'trimmed' ? 'primary' : 'outline'}
            onClick={() => setFilterTab('trimmed')}
            className="text-xs min-h-[36px]"
          >
            Trimmed ({plan.trimmedItems.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filterTab === 'omitted' ? 'primary' : 'outline'}
            onClick={() => setFilterTab('omitted')}
            className="text-xs min-h-[36px]"
          >
            Omitted ({plan.omittedItems.length})
          </Button>
        </div>

        {/* Inspection Items List */}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {displayedItems.length === 0 ? (
            <p className="text-xs text-text-muted italic py-4 text-center">
              No items in this category.
            </p>
          ) : (
            displayedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg border border-border-subtle bg-bg-app flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getTierBadgeVariant(item.tier)}>Tier {item.tier}</Badge>
                    <span className="font-semibold text-text-primary truncate">{item.title}</span>
                    <span className="text-text-muted">({item.category})</span>
                  </div>
                  <p className="text-[11px] text-text-muted">{item.reason}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="font-mono text-[11px] text-text-muted whitespace-nowrap">
                    ~{item.estimatedTokens.toLocaleString()} tokens (estimate)
                  </span>
                  <Badge variant={getStatusBadgeVariant(item.status)}>
                    {item.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        {format === 'lite' ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadPackage}
              disabled={isBlocked || isGeneratingZip}
              className="w-full sm:w-auto min-h-[44px] gap-1.5"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Download package (.zip)</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleCopyPrompt}
              disabled={isBlocked}
              className="w-full sm:w-auto min-h-[44px] gap-1.5"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              <span>Copy prompt</span>
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyPrompt}
              disabled={isBlocked}
              className="w-full sm:w-auto min-h-[44px] gap-1.5"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              <span>Copy prompt (Lite)</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleDownloadPackage}
              disabled={isBlocked || isGeneratingZip}
              className="w-full sm:w-auto min-h-[44px] gap-1.5"
            >
              {isGeneratingZip ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Generating package...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Download package</span>
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {/* Clipboard Fallback Modal */}
      <Dialog
        isOpen={fallbackModalOpen}
        onClose={() => setFallbackModalOpen(false)}
        title="Copy Export Prompt"
        description="Select all and copy the prompt text below into your destination AI model."
      >
        <div className="space-y-4">
          <Textarea
            ref={fallbackTextareaRef}
            readOnly
            value={fallbackPromptText}
            rows={12}
            className="font-mono text-xs"
          />
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (fallbackTextareaRef.current) {
                  fallbackTextareaRef.current.select();
                  showToast('Prompt selected. Press Ctrl+C to copy.', 'info');
                }
              }}
              className="min-h-[44px]"
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFallbackModalOpen(false)}
              className="min-h-[44px]"
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function getTierBadgeVariant(tier: string): 'default' | 'brass' {
  switch (tier) {
    case '1':
      return 'brass';
    default:
      return 'default';
  }
}

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'default' {
  switch (status) {
    case 'included':
      return 'success';
    case 'trimmed':
      return 'warning';
    default:
      return 'default';
  }
}
