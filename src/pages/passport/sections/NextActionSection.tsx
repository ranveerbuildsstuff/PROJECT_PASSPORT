import React from 'react';
import type { PassportV1 } from '../../../domain';
import { Textarea } from '../../../ui';

export interface NextActionSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function NextActionSection({
  draft,
  updateDraft,
  errors = {},
}: NextActionSectionProps): React.ReactElement {
  const { nextAction } = draft;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateDraft((prev) => ({
      ...prev,
      nextAction: val,
    }));
  };

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        label="Immediate next action"
        value={nextAction}
        onChange={handleChange}
        rows={3}
        placeholder="What should the recipient AI do next when continuing this project?"
        helperText="Defining a clear next action provides instant orientation for continuing conversations."
        error={errors['nextAction']}
      />
    </div>
  );
}
