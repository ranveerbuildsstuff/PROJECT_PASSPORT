import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import type { PassportV1, Bug, BugSeverity, BugStatus } from '../../../domain';
import { newId, moveItem } from '../../../domain';
import { Select, Button, useToast, CompactEmptyState, Textarea } from '../../../ui';

export interface BugsSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function BugsSection({
  draft,
  updateDraft,
  errors = {},
}: BugsSectionProps): React.ReactElement {
  const { bugs, bugsReviewed } = draft;
  const { showToast } = useToast();

  const handleAddItem = () => {
    updateDraft((prev) => ({
      ...prev,
      bugs: [
        ...prev.bugs,
        {
          id: newId(),
          text: '',
          severity: 'medium',
          status: 'open',
        },
      ],
    }));
  };

  const handleChangeField = (index: number, field: keyof Bug, value: string) => {
    updateDraft((prev) => {
      const copy = [...prev.bugs];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, [field]: value };
      return { ...prev, bugs: copy };
    });
  };

  const handleToggleReviewed = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    updateDraft((prev) => ({
      ...prev,
      bugsReviewed: checked,
    }));
  };

  const handleMove = (from: number, to: number) => {
    updateDraft((prev) => ({
      ...prev,
      bugs: moveItem(prev.bugs, from, to),
    }));
  };

  const handleDelete = (index: number) => {
    const itemToDelete = bugs[index];
    if (!itemToDelete) return;
    updateDraft((prev) => {
      const copy = [...prev.bugs];
      copy.splice(index, 1);
      return { ...prev, bugs: copy };
    });

    showToast(
      `Deleted bug "${itemToDelete.text.slice(0, 20) || index + 1}"`,
      'info',
      undefined,
      {
        label: 'Undo',
        onClick: () => {
          updateDraft((prev) => {
            const copy = [...prev.bugs];
            copy.splice(index, 0, itemToDelete);
            return { ...prev, bugs: copy };
          });
        },
      }
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Review confirmation toggle */}
      <label className="flex items-center gap-3 p-3 rounded-lg border border-border-subtle bg-bg-app hover:bg-bg-app/80 transition-colors cursor-pointer select-none min-h-[44px]">
        <input
          type="checkbox"
          checked={bugsReviewed}
          onChange={handleToggleReviewed}
          className="min-h-[44px] min-w-[44px] h-6 w-6 rounded border-border-subtle text-accent-brass focus:ring-accent-brass accent-accent-brass cursor-pointer shrink-0"
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">
            I reviewed bugs and there are none
          </span>
          <span className="text-xs text-text-muted">
            Checking this satisfies the readiness bug review check even if the bug list is empty.
          </span>
        </div>
      </label>

      {bugs.length === 0 ? (
        <CompactEmptyState
          message="No bugs yet"
          actionLabel="Add bug"
          onAction={handleAddItem}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddItem}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add bug</span>
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {bugs.map((item, index) => {
              const itemNum = index + 1;
              const textError =
                errors[`bugs.${index}.text`] || errors[`bugs.${index}`];

              return (
                <div
                  key={item.id}
                  role="group"
                  aria-label={`Bug ${itemNum}`}
                  className="p-3.5 rounded-lg border border-border-subtle bg-bg-app flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 flex-wrap gap-2">
                    <span className="text-xs font-semibold text-text-muted">
                      Bug {itemNum}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMove(index, index - 1)}
                        aria-label={`Move bug ${itemNum} up`}
                        className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={index === bugs.length - 1}
                        onClick={() => handleMove(index, index + 1)}
                        aria-label={`Move bug ${itemNum} down`}
                        className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(index)}
                        aria-label={`Delete bug ${itemNum}`}
                        className="p-2 text-color-danger hover:bg-color-danger/10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <div className="sm:col-span-3">
                      <Textarea
                        label="Description"
                        required
                        value={item.text}
                        onChange={(e) => handleChangeField(index, 'text', e.target.value)}
                        placeholder="Session expires unexpectedly on refresh"
                        error={textError}
                      />
                    </div>
                    <Select
                      label="Severity"
                      value={item.severity}
                      onChange={(e) =>
                        handleChangeField(index, 'severity', e.target.value as BugSeverity)
                      }
                      options={[
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                      ]}
                    />
                    <Select
                      label="Status"
                      value={item.status}
                      onChange={(e) =>
                        handleChangeField(index, 'status', e.target.value as BugStatus)
                      }
                      options={[
                        { value: 'open', label: 'Open' },
                        { value: 'fixed', label: 'Fixed' },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
