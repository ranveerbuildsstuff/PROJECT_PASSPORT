import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import type { PassportV1 } from '../../../domain';
import { moveItem } from '../../../domain';
import { Button, useToast, CompactEmptyState, Textarea } from '../../../ui';

export interface InstructionsSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function InstructionsSection({
  draft,
  updateDraft,
  errors = {},
}: InstructionsSectionProps): React.ReactElement {
  const { instructions } = draft;
  const { showToast } = useToast();

  const handleAddItem = () => {
    updateDraft((prev) => ({
      ...prev,
      instructions: [...prev.instructions, ''],
    }));
  };

  const handleChangeText = (index: number, value: string) => {
    updateDraft((prev) => {
      const copy = [...prev.instructions];
      if (index < 0 || index >= copy.length) return prev;
      copy[index] = value;
      return { ...prev, instructions: copy };
    });
  };

  const handleMove = (from: number, to: number) => {
    updateDraft((prev) => ({
      ...prev,
      instructions: moveItem(prev.instructions, from, to),
    }));
  };

  const handleDelete = (index: number) => {
    const itemToDelete = instructions[index];
    if (itemToDelete === undefined) return;
    updateDraft((prev) => {
      const copy = [...prev.instructions];
      copy.splice(index, 1);
      return { ...prev, instructions: copy };
    });

    showToast(
      `Deleted instruction "${itemToDelete.slice(0, 20) || index + 1}"`,
      'info',
      undefined,
      {
        label: 'Undo',
        onClick: () => {
          updateDraft((prev) => {
            const copy = [...prev.instructions];
            copy.splice(index, 0, itemToDelete);
            return { ...prev, instructions: copy };
          });
        },
      }
    );
  };

  if (instructions.length === 0) {
    return (
      <CompactEmptyState
        message="No instructions yet"
        actionLabel="Add instruction"
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
          <span>Add instruction</span>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {instructions.map((item, index) => {
          const itemNum = index + 1;
          const itemError =
            errors[`instructions.${index}`];

          return (
            <div
              key={index}
              role="group"
              aria-label={`Instruction ${itemNum}`}
              className="p-3.5 rounded-lg border border-border-subtle bg-bg-app flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 flex-wrap gap-2">
                <span className="text-xs font-semibold text-text-muted">
                  Instruction {itemNum}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, index - 1)}
                    aria-label={`Move instruction ${itemNum} up`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === instructions.length - 1}
                    onClick={() => handleMove(index, index + 1)}
                    aria-label={`Move instruction ${itemNum} down`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete instruction ${itemNum}`}
                    className="p-2 text-color-danger hover:bg-color-danger/10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <Textarea
                label="Rule / Instruction"
                value={item}
                onChange={(e) => handleChangeText(index, e.target.value)}
                placeholder="Always write automated tests before committing"
                error={itemError}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
