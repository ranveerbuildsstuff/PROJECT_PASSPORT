import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import type { PassportV1, StackItem } from '../../../domain';
import { moveItem } from '../../../domain';
import { Input, Button, useToast, CompactEmptyState, Textarea } from '../../../ui';

export interface StackSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function StackSection({
  draft,
  updateDraft,
  errors = {},
}: StackSectionProps): React.ReactElement {
  const { stack } = draft;
  const { showToast } = useToast();

  const handleAddItem = () => {
    updateDraft((prev) => ({
      ...prev,
      stack: [...prev.stack, { name: '', role: '', version: '', notes: '' }],
    }));
  };

  const handleChangeItem = (index: number, field: keyof StackItem, value: string) => {
    updateDraft((prev) => {
      const copy = [...prev.stack];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, [field]: value };
      return { ...prev, stack: copy };
    });
  };

  const handleMove = (from: number, to: number) => {
    updateDraft((prev) => ({
      ...prev,
      stack: moveItem(prev.stack, from, to),
    }));
  };

  const handleDelete = (index: number) => {
    const itemToDelete = stack[index];
    if (!itemToDelete) return;
    updateDraft((prev) => {
      const copy = [...prev.stack];
      copy.splice(index, 1);
      return { ...prev, stack: copy };
    });

    showToast(
      `Deleted stack item "${itemToDelete.name || index + 1}"`,
      'info',
      undefined,
      {
        label: 'Undo',
        onClick: () => {
          updateDraft((prev) => {
            const copy = [...prev.stack];
            copy.splice(index, 0, itemToDelete);
            return { ...prev, stack: copy };
          });
        },
      }
    );
  };

  if (stack.length === 0) {
    return (
      <CompactEmptyState
        message="No tech stack items yet"
        actionLabel="Add stack item"
        onAction={handleAddItem}
      />
    );
  }

  return (
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
          <span>Add stack item</span>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {stack.map((item, index) => {
          const itemNum = index + 1;
          const itemError = errors[`stack.${index}.name`] || errors[`stack.${index}`];

          return (
            <div
              key={index}
              role="group"
              aria-label={`Stack item ${itemNum}`}
              className="p-3.5 rounded-lg border border-border-subtle bg-bg-app flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 flex-wrap gap-2">
                <span className="text-xs font-semibold text-text-muted">
                  Stack item {itemNum}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, index - 1)}
                    aria-label={`Move stack item ${itemNum} up`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === stack.length - 1}
                    onClick={() => handleMove(index, index + 1)}
                    aria-label={`Move stack item ${itemNum} down`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete stack item ${itemNum}`}
                    className="p-2 text-color-danger hover:bg-color-danger/10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label="Name"
                  required
                  value={item.name}
                  onChange={(e) => handleChangeItem(index, 'name', e.target.value)}
                  placeholder="React, PostgreSQL"
                  error={itemError}
                />
                <Input
                  label="Role"
                  value={item.role || ''}
                  onChange={(e) => handleChangeItem(index, 'role', e.target.value)}
                  placeholder="Frontend UI"
                />
                <Input
                  label="Version"
                  value={item.version || ''}
                  onChange={(e) => handleChangeItem(index, 'version', e.target.value)}
                  placeholder="18.2.0"
                  isMonospace
                />
              </div>

              <Textarea
                label="Notes"
                value={item.notes || ''}
                onChange={(e) => handleChangeItem(index, 'notes', e.target.value)}
                placeholder="Using strict mode and server components"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
