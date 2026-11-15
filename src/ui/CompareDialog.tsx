import React, { useState, useMemo } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Badge } from './Badge';
import { Select } from './Select';
import { ArrowLeftRight, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import type { CheckpointRecord } from '../storage/db';
import type { PassportV1 } from '../domain/passport.schema';
import { checkpointKind, checkpointSequence, type CheckpointFileItem } from '../domain/checkpoint';
import { diffPassports, type DiffSectionId, type SectionDiff } from '../domain/diff';
import { getCurrentFileHashes } from '../storage';

export interface CompareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  checkpoints: CheckpointRecord[];
  currentPassport: PassportV1 | null;
  projectId?: string;
  currentFiles?: CheckpointFileItem[];
  initialFromId?: string;
  initialToId?: string;
}

export function CompareDialog({
  isOpen,
  onClose,
  checkpoints,
  currentPassport,
  projectId,
  currentFiles,
  initialFromId,
  initialToId = 'current',
}: CompareDialogProps): React.ReactElement {
  const sequenceMap = useMemo(() => checkpointSequence(checkpoints), [checkpoints]);

  // Default from: initialFromId or first checkpoint or current
  const defaultFrom = initialFromId || (checkpoints.length > 0 ? checkpoints[0]!.id : 'current');
  const [fromId, setFromId] = useState<string>(defaultFrom);
  const [toId, setToId] = useState<string>(initialToId);
  const [loadedCurrentFiles, setLoadedCurrentFiles] = useState<CheckpointFileItem[] | null>(
    currentFiles ?? null
  );

  // Sync when initialFromId changes
  React.useEffect(() => {
    if (initialFromId) {
      setFromId(initialFromId);
    }
  }, [initialFromId]);

  // Fetch current file hashes when comparing against current
  React.useEffect(() => {
    if (currentFiles) {
      setLoadedCurrentFiles(currentFiles);
      return;
    }
    if (isOpen && projectId && (fromId === 'current' || toId === 'current')) {
      let isMounted = true;
      getCurrentFileHashes(projectId)
        .then((files) => {
          if (isMounted) {
            setLoadedCurrentFiles(files);
          }
        })
        .catch(() => {
          if (isMounted) {
            setLoadedCurrentFiles(null);
          }
        });
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, projectId, fromId, toId, currentFiles]);

  const effectiveCurrentFiles = currentFiles ?? loadedCurrentFiles ?? currentPassport?.files;

  // Build select options
  const versionOptions = useMemo(() => {
    const opts = [
      { value: 'current', label: 'Current passport' },
    ];

    // Sorted newest first
    const sorted = [...checkpoints].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    for (const cp of sorted) {
      const seq = sequenceMap.get(cp.id) ?? 1;
      const kind = checkpointKind(cp);
      const notePart = cp.note ? ` - ${cp.note}` : '';
      const datePart = new Date(cp.createdAt).toLocaleDateString();
      opts.push({
        value: cp.id,
        label: `#${seq} • ${kind.toUpperCase()}${notePart} (${datePart})`,
      });
    }

    return opts;
  }, [checkpoints, sequenceMap]);

  // Resolve from and to sources
  const fromSource = useMemo(() => {
    if (fromId === 'current') {
      return currentPassport
        ? { passport: currentPassport, files: effectiveCurrentFiles }
        : null;
    }
    const cp = checkpoints.find((c) => c.id === fromId);
    if (!cp || !cp.passport) return null;
    return {
      id: cp.id,
      createdAt: cp.createdAt,
      passport: cp.passport,
      files: cp.files,
      conversationIds: cp.conversationIds,
    };
  }, [fromId, currentPassport, checkpoints, effectiveCurrentFiles]);

  const toSource = useMemo(() => {
    if (toId === 'current') {
      return currentPassport
        ? { passport: currentPassport, files: effectiveCurrentFiles }
        : null;
    }
    const cp = checkpoints.find((c) => c.id === toId);
    if (!cp || !cp.passport) return null;
    return {
      id: cp.id,
      createdAt: cp.createdAt,
      passport: cp.passport,
      files: cp.files,
      conversationIds: cp.conversationIds,
    };
  }, [toId, currentPassport, checkpoints, effectiveCurrentFiles]);

  // Compute diff
  const diff = useMemo(() => {
    if (!fromSource || !toSource) return null;
    return diffPassports(fromSource, toSource);
  }, [fromSource, toSource]);

  // Swap from and to
  const handleSwap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Compare versions"
      description="Side-by-side structured diff of changes between any two checkpoints or the current passport."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Version Pickers Header */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,1fr] gap-3 items-end p-3.5 rounded-lg border border-border-subtle bg-bg-app">
          <div>
            <label
              htmlFor="compare-from"
              className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1"
            >
              Base (From)
            </label>
            <Select
              id="compare-from"
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              options={versionOptions}
              className="w-full text-xs"
            />
          </div>

          <div className="flex justify-center pb-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSwap}
              aria-label="Swap comparison directions"
              title="Swap versions"
              className="min-h-[44px] min-w-[44px] px-2.5"
            >
              <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>

          <div>
            <label
              htmlFor="compare-to"
              className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1"
            >
              Target (To)
            </label>
            <Select
              id="compare-to"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              options={versionOptions}
              className="w-full text-xs"
            />
          </div>
        </div>

        {/* Diff Summary Bar */}
        {diff && (
          <div className="flex items-center justify-between p-3 rounded-lg border border-border-subtle bg-bg-app text-xs">
            <span className="font-medium text-text-primary">{diff.summary}</span>
            <Badge variant={diff.hasChanges ? 'brass' : 'success'}>
              {diff.hasChanges ? `${diff.totalChanges} changes` : 'Identical'}
            </Badge>
          </div>
        )}

        {/* Section Diffs */}
        {diff && !diff.hasChanges && (
          <div className="py-12 px-4 text-center border border-dashed border-border-subtle rounded-lg">
            <CheckCircle2 className="w-8 h-8 text-color-success mx-auto mb-2 opacity-80" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-text-primary mb-1">No differences found</h4>
            <p className="text-xs text-text-muted max-w-sm mx-auto">
              These two versions have identical passport contents and specifications.
            </p>
          </div>
        )}

        {diff && diff.hasChanges && (
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {(Object.keys(diff.sections) as DiffSectionId[]).map((secKey) => {
              const sec = diff.sections[secKey];
              if (!sec.hasChanges && !sec.notRecorded) return null;
              return <SectionDiffCard key={secKey} section={sec} />;
            })}
          </div>
        )}

        <div className="flex items-center justify-end pt-3 border-t border-border-subtle">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function SectionDiffCard({ section }: { section: SectionDiff }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface overflow-hidden">
      {/* Card Header Accordion Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3.5 hover:bg-bg-app/50 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-brass cursor-pointer min-h-[44px]"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" aria-hidden="true" />
          )}
          <span className="text-sm font-semibold text-text-primary">{section.title}</span>
          <span className="text-xs text-text-muted">({section.summary})</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {section.added.length > 0 && (
            <Badge variant="success">+{section.added.length} added</Badge>
          )}
          {section.changed.length > 0 && (
            <Badge variant="brass">{section.changed.length} changed</Badge>
          )}
          {section.removed.length > 0 && (
            <Badge variant="danger">-{section.removed.length} removed</Badge>
          )}
          {section.reordered && (
            <Badge variant="default">reordered</Badge>
          )}
        </div>
      </button>

      {/* Card Body */}
      {isOpen && (
        <div className="p-3.5 pt-0 border-t border-border-subtle/50 space-y-3 mt-2 text-xs">
          {section.notRecorded && (
            <div className="p-2.5 rounded bg-bg-app border border-border-subtle text-text-muted italic">
              {section.summary}
            </div>
          )}

          {/* Added items */}
          {section.added.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-color-success uppercase tracking-wider block">
                Added ({section.added.length})
              </span>
              <div className="space-y-1">
                {section.added.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-color-success/10 border border-color-success/20 text-text-primary flex items-start gap-2"
                  >
                    <span className="text-color-success font-bold">+</span>
                    <span className="font-mono break-all">{formatDiffItem(item)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Changed items */}
          {section.changed.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-accent-brass uppercase tracking-wider block">
                Changed ({section.changed.length})
              </span>
              <div className="space-y-2">
                {section.changed.map((change, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded bg-bg-app border border-border-subtle space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text-primary">{change.label}</span>
                      {change.contentChanged && (
                        <Badge variant="warning">Content changed (SHA-256)</Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="p-2 rounded bg-color-danger/10 border border-color-danger/20 text-text-muted">
                        <span className="text-[10px] uppercase font-bold text-color-danger block mb-0.5">
                          Before:
                        </span>
                        <div className="break-all font-mono">
                          {formatDiffItem(change.before)}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-color-success/10 border border-color-success/20 text-text-primary">
                        <span className="text-[10px] uppercase font-bold text-color-success block mb-0.5">
                          After:
                        </span>
                        <div className="break-all font-mono">
                          {formatDiffItem(change.after)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Removed items */}
          {section.removed.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-color-danger uppercase tracking-wider block">
                Removed ({section.removed.length})
              </span>
              <div className="space-y-1">
                {section.removed.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded bg-color-danger/10 border border-color-danger/20 text-text-muted flex items-start gap-2"
                  >
                    <span className="text-color-danger font-bold">-</span>
                    <span className="font-mono line-through break-all">{formatDiffItem(item)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDiffItem(item: unknown): string {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item);

  const obj = item as Record<string, unknown>;
  if ('field' in obj && 'value' in obj) {
    return `${obj.field}: "${obj.value}"`;
  }
  if ('path' in obj) {
    return `${obj.path} (${obj.purpose || 'no purpose'}, ${obj.included ? 'included' : 'excluded'})`;
  }
  if ('text' in obj) {
    return String(obj.text);
  }
  if ('name' in obj) {
    const rolePart = obj.role ? ` (${obj.role})` : '';
    const verPart = obj.version ? ` v${obj.version}` : '';
    return `${obj.name}${rolePart}${verPart}`;
  }
  if ('decision' in obj) {
    return `${obj.decision} — ${obj.reason || ''}`;
  }
  if ('title' in obj) {
    return String(obj.title);
  }

  return JSON.stringify(item);
}
