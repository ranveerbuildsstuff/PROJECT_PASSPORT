import React from 'react';
import type { PassportV1, ProjectStatus } from '../../../domain';
import { Input, Textarea, Select } from '../../../ui';

export interface BasicsSectionProps {
  draft: PassportV1;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  errors?: Record<string, string>;
}

export function BasicsSection({
  draft,
  updateDraft,
  errors = {},
}: BasicsSectionProps): React.ReactElement {
  const { project } = draft;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    updateDraft((prev) => ({
      ...prev,
      project: { ...prev.project, name: val },
    }));
  };

  const handleGoalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateDraft((prev) => ({
      ...prev,
      project: { ...prev.project, goal: val },
    }));
  };

  const handleSummaryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    updateDraft((prev) => ({
      ...prev,
      project: { ...prev.project, summary: val },
    }));
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as ProjectStatus;
    updateDraft((prev) => ({
      ...prev,
      project: { ...prev.project, status: val },
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Project name"
        required
        value={project.name}
        onChange={handleNameChange}
        error={errors['project.name']}
        placeholder="My AI-assisted project"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Project status"
          value={project.status}
          onChange={handleStatusChange}
          error={errors['project.status']}
          options={[
            { value: 'idea', label: 'Idea' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'paused', label: 'Paused' },
            { value: 'done', label: 'Done' },
          ]}
        />
      </div>

      <Textarea
        label="Project goal"
        value={project.goal}
        onChange={handleGoalChange}
        rows={3}
        placeholder="What is this project aiming to achieve?"
        helperText="A clear statement of the primary outcome or deliverable."
      />

      <Textarea
        label="Executive summary"
        value={project.summary}
        onChange={handleSummaryChange}
        rows={3}
        placeholder="High-level architecture and current state summary"
        helperText="Brief summary for new AI models to quickly understand context."
      />
    </div>
  );
}
