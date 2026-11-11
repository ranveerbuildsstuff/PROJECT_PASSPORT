import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus, CheckSquare } from 'lucide-react';
import type { PassportV1, Task, TaskStatus, TaskPriority } from '../../../domain';
import { newId, moveItem } from '../../../domain';
import { Input, Select, Button, useToast, EmptyState } from '../../../ui';

export interface TasksSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function TasksSection({
  draft,
  updateDraft,
  errors = {},
}: TasksSectionProps): React.ReactElement {
  const { tasks } = draft;
  const { showToast } = useToast();

  const handleAddItem = () => {
    updateDraft((prev) => ({
      ...prev,
      tasks: [
        ...prev.tasks,
        {
          id: newId(),
          text: '',
          status: 'todo',
          priority: 'medium',
        },
      ],
    }));
  };

  const handleChangeField = (index: number, field: keyof Task, value: string) => {
    updateDraft((prev) => {
      const copy = [...prev.tasks];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, [field]: value };
      return { ...prev, tasks: copy };
    });
  };

  const handleMove = (from: number, to: number) => {
    updateDraft((prev) => ({
      ...prev,
      tasks: moveItem(prev.tasks, from, to),
    }));
  };

  const handleDelete = (index: number) => {
    const itemToDelete = tasks[index];
    if (!itemToDelete) return;
    updateDraft((prev) => {
      const copy = [...prev.tasks];
      copy.splice(index, 1);
      return { ...prev, tasks: copy };
    });

    showToast(
      `Deleted task "${itemToDelete.text.slice(0, 20) || index + 1}"`,
      'info',
      undefined,
      {
        label: 'Undo',
        onClick: () => {
          updateDraft((prev) => {
            const copy = [...prev.tasks];
            copy.splice(index, 0, itemToDelete);
            return { ...prev, tasks: copy };
          });
        },
      }
    );
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<CheckSquare className="w-6 h-6 text-accent-brass" aria-hidden="true" />}
        title="No tasks recorded"
        description="Track active, planned, or blocked tasks for your project."
        actionLabel="Add task"
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
          <span>Add task</span>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {tasks.map((item, index) => {
          const itemNum = index + 1;
          const textError =
            errors[`tasks.${index}.text`] || errors[`tasks.${index}`];

          return (
            <div
              key={item.id}
              className="p-3.5 rounded-lg border border-border-subtle bg-bg-app flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 flex-wrap gap-2">
                <span className="text-xs font-semibold text-text-muted">
                  Task {itemNum}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, index - 1)}
                    aria-label={`Move task ${itemNum} up`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === tasks.length - 1}
                    onClick={() => handleMove(index, index + 1)}
                    aria-label={`Move task ${itemNum} down`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete task ${itemNum}`}
                    className="p-2 text-color-danger hover:bg-color-danger/10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                <div className="sm:col-span-3">
                  <Input
                    label="Description"
                    required
                    value={item.text}
                    onChange={(e) => handleChangeField(index, 'text', e.target.value)}
                    placeholder="e.g. Implement passport live preview"
                    error={textError}
                  />
                </div>
                <Select
                  label="Status"
                  value={item.status}
                  onChange={(e) =>
                    handleChangeField(index, 'status', e.target.value as TaskStatus)
                  }
                  options={[
                    { value: 'todo', label: 'To do' },
                    { value: 'doing', label: 'Doing' },
                    { value: 'blocked', label: 'Blocked' },
                    { value: 'done', label: 'Done' },
                  ]}
                />
                <Select
                  label="Priority"
                  value={item.priority}
                  onChange={(e) =>
                    handleChangeField(index, 'priority', e.target.value as TaskPriority)
                  }
                  options={[
                    { value: 'high', label: 'High' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'low', label: 'Low' },
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
