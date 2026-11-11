import React from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import type { PassportV1, Decision, DecisionStatus } from '../../../domain';
import { newId, moveItem } from '../../../domain';
import { Input, Select, Button, useToast, CompactEmptyState, Badge, Textarea } from '../../../ui';

export interface DecisionsSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function DecisionsSection({
  draft,
  updateDraft,
  errors = {},
}: DecisionsSectionProps): React.ReactElement {
  const { decisions } = draft;
  const { showToast } = useToast();

  const handleAddItem = () => {
    updateDraft((prev) => ({
      ...prev,
      decisions: [
        ...prev.decisions,
        {
          id: newId(),
          decision: '',
          reason: '',
          date: new Date().toISOString().slice(0, 10),
          status: 'active',
        },
      ],
    }));
  };

  const handleChangeField = (index: number, field: keyof Decision, value: string) => {
    updateDraft((prev) => {
      const copy = [...prev.decisions];
      const current = copy[index];
      if (!current) return prev;
      copy[index] = { ...current, [field]: value };
      return { ...prev, decisions: copy };
    });
  };

  const handleMove = (from: number, to: number) => {
    updateDraft((prev) => ({
      ...prev,
      decisions: moveItem(prev.decisions, from, to),
    }));
  };

  const handleDelete = (index: number) => {
    const itemToDelete = decisions[index];
    if (!itemToDelete) return;
    updateDraft((prev) => {
      const copy = [...prev.decisions];
      copy.splice(index, 1);
      return { ...prev, decisions: copy };
    });

    showToast(
      `Deleted decision "${itemToDelete.decision.slice(0, 20) || index + 1}"`,
      'info',
      undefined,
      {
        label: 'Undo',
        onClick: () => {
          updateDraft((prev) => {
            const copy = [...prev.decisions];
            copy.splice(index, 0, itemToDelete);
            return { ...prev, decisions: copy };
          });
        },
      }
    );
  };

  if (decisions.length === 0) {
    return (
      <CompactEmptyState
        message="No decisions yet"
        actionLabel="Add decision"
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
          <span>Add decision</span>
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {decisions.map((item, index) => {
          const itemNum = index + 1;
          const decisionError =
            errors[`decisions.${index}.decision`] || errors[`decisions.${index}`];
          const reasonError = errors[`decisions.${index}.reason`];
          const isSuperseded = item.status === 'superseded';

          return (
            <div
              key={item.id}
              role="group"
              aria-label={`Decision ${itemNum}`}
              className={`p-3.5 rounded-lg border transition-opacity flex flex-col gap-3 ${
                isSuperseded
                  ? 'opacity-60 bg-bg-app/40 border-border-subtle/50'
                  : 'bg-bg-app border-border-subtle'
              }`}
            >
              <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-muted">
                    Decision {itemNum}
                  </span>
                  {isSuperseded && (
                    <Badge variant="default">
                      Superseded
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMove(index, index - 1)}
                    aria-label={`Move decision ${itemNum} up`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={index === decisions.length - 1}
                    onClick={() => handleMove(index, index + 1)}
                    aria-label={`Move decision ${itemNum} down`}
                    className="p-2 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:pointer-events-none min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    aria-label={`Delete decision ${itemNum}`}
                    className="p-2 text-color-danger hover:bg-color-danger/10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <Textarea
                    label="Decision"
                    required
                    value={item.decision}
                    onChange={(e) => handleChangeField(index, 'decision', e.target.value)}
                    placeholder="Use PostgreSQL for order data"
                    error={decisionError}
                  />
                </div>
                <Select
                  label="Decision status"
                  value={item.status}
                  onChange={(e) =>
                    handleChangeField(index, 'status', e.target.value as DecisionStatus)
                  }
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'superseded', label: 'Superseded' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <Textarea
                    label="Reason"
                    required
                    value={item.reason}
                    onChange={(e) => handleChangeField(index, 'reason', e.target.value)}
                    placeholder="Provides strict ACID guarantees for transaction data"
                    error={reasonError}
                  />
                </div>
                <Input
                  label="Date"
                  type="date"
                  value={item.date || ''}
                  onChange={(e) => handleChangeField(index, 'date', e.target.value)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
