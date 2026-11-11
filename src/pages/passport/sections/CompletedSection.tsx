import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import type { PassportV1 } from '../../../domain';
import { newId, moveItem } from '../../../domain';
import { Input, Button, useToast, EmptyState } from '../../../ui';

export interface CompletedSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function CompletedSection({
  draft,
  updateDraft,
  errors = {},
}: CompletedSectionProps): React.ReactElement {
  const { completed } = draft;
  const { showToast } = useToast();

  const handleAddItem = () => {
    updateDraft((prev) => ({
      ...prev,
      completed: [...prev.completed, { id: newId(), text: '' }],
    }));
  };

  const handleChangeText = (index: number, value: string) => {
    updateDraft((prev) => {
      const copy = [...prev.completed];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, text: value };
      return { ...prev, completed: copy };
    });
  };

  const handleMove = (from: number, to: number) => {
    updateDraft((prev) => ({
      ...prev,
      completed: moveItem(prev.completed, from, to),
    }));
  };

  const handleDelete = (index: number) => {
    const itemToDelete = completed[index];
    if (!itemToDelete) return;
    updateDraft((prev) => {
      const copy = [...prev.completed];
      copy.splice(index, 1);
      return { ...prev, completed: copy };
    });

    showToast(
      `Deleted completed item "${itemToDelete.text.slice(0, 20) || index + 1}"`,
      'info',
      undefined,
      {
        label: 'Undo',
        onClick: () => {
          updateDraft((prev) => {
            const copy = [...prev.completed];
            copy.splice(index, 0, itemToDelete);
            return { ...prev, completed: copy };
          });
        },
      }
    );
  };

  if (completed.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="w-6 h-6 text-color-success" aria-hidden="true" />}
        title="No completed milestones yet"
        description="Record completed tasks, shipped features, or architectural phases."
        actionLabel="Add completed item"
        onAction={handleAddItem}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddItem}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Add completed item</span>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {completed.map((item, index) => {
          const itemNum = index + 1;
          const itemError =
            errors[`completed.${index}.text`] || errors[`completed.${index}`];

          return (
            <div
              key={item.id}
              className="p-3.5 rounded-lg border border-border-subtle bg-bg-app flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 flex-wrap gap-2">
                <span className="text-xs font-semibold text-text-muted">
                  Completed item {itemNum}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, index - 1)}
                    aria-label={`Move completed item ${itemNum} up`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === completed.length - 1}
                    onClick={() => handleMove(index, index + 1)}
                    aria-label={`Move completed item ${itemNum} down`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete completed item ${itemNum}`}
                    className="p-2 text-color-danger hover:bg-color-danger/10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <Input
                label="Description"
                required
                value={item.text}
                onChange={(e) => handleChangeText(index, e.target.value)}
                placeholder="e.g. Set up Dexie IndexedDB service layer"
                error={itemError}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
