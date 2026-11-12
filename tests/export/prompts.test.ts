import { describe, it, expect } from 'vitest';
import { generateCapturePrompt, CAPTURE_PROMPT_VERSION } from '../../src/export/prompts';
import {
  PassportImportSchema,
  estimateTokens,
  ProjectStatusSchema,
  RequirementPrioritySchema,
  DecisionStatusSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  BugSeveritySchema,
  BugStatusSchema,
} from '../../src/domain';

describe('generateCapturePrompt', () => {
  it('exports CAPTURE_PROMPT_VERSION = 1', () => {
    expect(CAPTURE_PROMPT_VERSION).toBe(1);
  });

  it('is deterministic and returns identical output on subsequent calls', () => {
    const prompt1 = generateCapturePrompt();
    const prompt2 = generateCapturePrompt();
    expect(prompt1).toBe(prompt2);
  });

  it('contains all required phrases verbatim', () => {
    const prompt = generateCapturePrompt();

    expect(prompt).toContain('Reply with ONLY one JSON object in one ```json block.');
    expect(prompt).toContain('Follow the skeleton, and omit fields rather than invent.');
    expect(prompt).toContain('Decisions need reasons.');
    expect(prompt).toContain('List completed items, pending tasks and open bugs accurately.');
    expect(prompt).toContain('Set bugsReviewed true only if certain there are no open bugs.');
    expect(prompt).toContain('Always give nextAction.');
    expect(prompt).toContain('Put uncertainty in openQuestions.');
    expect(prompt).toContain('Never include secrets (write [REDACTED]).');
    expect(prompt).toContain('Omit project id, timestamps, files and conversations.');
  });

  it('contains every schema enum option', () => {
    const prompt = generateCapturePrompt();

    // Project status
    for (const opt of ProjectStatusSchema.options) {
      expect(prompt).toContain(opt);
    }
    // Requirement priority
    for (const opt of RequirementPrioritySchema.options) {
      expect(prompt).toContain(opt);
    }
    // Decision status
    for (const opt of DecisionStatusSchema.options) {
      expect(prompt).toContain(opt);
    }
    // Task status
    for (const opt of TaskStatusSchema.options) {
      expect(prompt).toContain(opt);
    }
    // Task priority
    for (const opt of TaskPrioritySchema.options) {
      expect(prompt).toContain(opt);
    }
    // Bug severity
    for (const opt of BugSeveritySchema.options) {
      expect(prompt).toContain(opt);
    }
    // Bug status
    for (const opt of BugStatusSchema.options) {
      expect(prompt).toContain(opt);
    }
  });

  it('has a skeleton that validates against PassportImportSchema', () => {
    const prompt = generateCapturePrompt();
    const match = /Skeleton:\s*```json\s*([\s\S]*?)```/.exec(prompt);
    expect(match).not.toBeNull();
    if (!match || !match[1]) throw new Error('Expected markdown json block');
    const skeletonJson = match[1].trim();

    const parsed = JSON.parse(skeletonJson);
    const validation = PassportImportSchema.safeParse(parsed);
    expect(validation.success).toBe(true);
  });

  it('contains no files or conversations in the skeleton', () => {
    const prompt = generateCapturePrompt();
    const match = /Skeleton:\s*```json\s*([\s\S]*?)```/.exec(prompt);
    expect(match).not.toBeNull();
    if (!match || !match[1]) throw new Error('Expected markdown json block');
    const skeletonJson = match[1].trim();
    const parsed = JSON.parse(skeletonJson);

    expect(parsed.files).toBeUndefined();
    expect(parsed.conversations).toBeUndefined();
  });

  it('has estimateTokens well under 2,500', () => {
    const prompt = generateCapturePrompt();
    const tokens = estimateTokens(prompt);
    expect(tokens).toBeLessThan(2500);
    expect(tokens).toBeGreaterThan(100);
  });
});
