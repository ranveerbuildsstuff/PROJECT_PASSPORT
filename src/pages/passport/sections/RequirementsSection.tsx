import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, ListChecks } from 'lucide-react';
import type { PassportV1, RequirementPriority } from '../../../domain';
import { newId, moveItem } from '../../../domain';
import { Input, Select, Button, useToast, EmptyState } from '../../../ui';

export interface RequirementsSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function RequirementsSection({
  draft,
  updateDraft,
  errors = {},
}: RequirementsSectionProps): React.ReactElement {
  const { requirements } = draft;
  const { showToast } = useToast();

  const handleAddItem = () => {
    updateDraft((prev) => ({
      ...prev,
      requirements: [
        ...prev.requirements,
        { id: newId(), text: '', priority: 'must' },
      ],
    }));
  };

  const handleChangeText = (index: number, value: string) => {
    updateDraft((prev) => {
      const copy = [...prev.requirements];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, text: value };
      return { ...prev, requirements: copy };
    });
  };

  const handleChangePriority = (index: number, priority: RequirementPriority) => {
    updateDraft((prev) => {
      const copy = [...prev.requirements];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, priority };
      return { ...prev, requirements: copy };
    });
  };

  const handleMove = (from: number, to: number) => {
    updateDraft((prev) => ({
      ...prev,
      requirements: moveItem(prev.requirements, from, to),
    }));
  };

  const handleDelete = (index: number) => {
    const itemToDelete = requirements[index];
    if (!itemToDelete) return;
    updateDraft((prev) => {
      const copy = [...prev.requirements];
      copy.splice(index, 1);
      return { ...prev, requirements: copy };
    });

    showToast(
      `Deleted requirement "${itemToDelete.text.slice(0, 20) || index + 1}"`,
      'info',
      undefined,
      {
        label: 'Undo',
        onClick: () => {
          updateDraft((prev) => {
            const copy = [...prev.requirements];
            copy.splice(index, 0, itemToDelete);
            return { ...prev, requirements: copy };
          });
        },
      }
    );
  };

  if (requirements.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="w-6 h-6 text-accent-brass" aria-hidden="true" />}
        title="No requirements added"
        description="Capture functional, technical, and architectural requirements."
        actionLabel="Add requirement"
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
          <span>Add requirement</span>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {requirements.map((item, index) => {
          const itemNum = index + 1;
          const itemError =
            errors[`requirements.${index}.text`] || errors[`requirements.${index}`];

          return (
            <div
              key={item.id}
              className="p-3.5 rounded-lg border border-border-subtle bg-bg-app flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 flex-wrap gap-2">
                <span className="text-xs font-semibold text-text-muted">
                  Requirement {itemNum}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, index - 1)}
                    aria-label={`Move requirement ${itemNum} up`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === requirements.length - 1}
                    onClick={() => handleMove(index, index + 1)}
                    aria-label={`Move requirement ${itemNum} down`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete requirement ${itemNum}`}
                    className="p-2 text-color-danger hover:bg-color-danger/10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <Input
                    label="Description"
                    required
                    value={item.text}
                    onChange={(e) => handleChangeText(index, e.target.value)}
                    placeholder="e.g. Must support offline editing"
                    error={itemError}
                  />
                </div>
                <Select
                  label="Priority"
                  value={item.priority}
                  onChange={(e) =>
                    handleChangePriority(index, e.target.value as RequirementPriority)
                  }
                  options={[
                    { value: 'must', label: 'Must have' },
                    { value: 'should', label: 'Should have' },
                    { value: 'could', label: 'Could have' },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
