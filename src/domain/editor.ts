import type { PassportV1 } from './passport.schema';
import { PassportSchemaV1, formatZodIssueToPlainLanguage } from './passport.schema';

/**
 * Detailed validation result with indexed field error paths for inline UI display.
 */
export interface DetailedValidation {
  success: boolean;
  errors: string[];
  fieldErrors: Record<string, string>;
}

/**
 * Validates passport data and maps plain-language error messages to specific
 * field paths (e.g. "tasks.2.text", "tasks.2", "project.name") for targeted inline feedback.
 */
export function validatePassportDetailed(data: unknown): DetailedValidation {
  const parsed = PassportSchemaV1.safeParse(data);
  if (parsed.success) {
    return {
      success: true,
      errors: [],
      fieldErrors: {},
    };
  }

  const errors = parsed.error.issues.map(formatZodIssueToPlainLanguage);
  const fieldErrors: Record<string, string> = {};

  for (const issue of parsed.error.issues) {
    const msg = formatZodIssueToPlainLanguage(issue);
    const fullPath = issue.path.join('.');
    if (!fieldErrors[fullPath]) {
      fieldErrors[fullPath] = msg;
    }
    if (issue.path.length > 1) {
      const itemPath = issue.path.slice(0, 2).join('.');
      if (!fieldErrors[itemPath]) {
        fieldErrors[itemPath] = msg;
      }
    }
    if (issue.path.length > 0) {
      const sectionPath = String(issue.path[0]);
      if (!fieldErrors[sectionPath]) {
        fieldErrors[sectionPath] = msg;
      }
    }
  }

  return {
    success: false,
    errors,
    fieldErrors,
  };
}

/**
 * Generates a unique ID using crypto.randomUUID with RFC4122 v4 fallback.
 * Used for every newly added list item (requirements, decisions, tasks, bugs, etc.).
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Moves an item from one index to another within a list, returning a new array.
 * Out-of-range indices or identical indices result in a no-op (shallow copy of list).
 * The original list is never mutated.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (
    from < 0 ||
    from >= list.length ||
    to < 0 ||
    to >= list.length ||
    from === to
  ) {
    return [...list];
  }
  const copy = [...list];
  const item = copy.splice(from, 1)[0];
  if (item === undefined) {
    return copy;
  }
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Editor-owned fields: the subset of a PassportV1 that the passport editor modifies.
 */
export type EditorOwnedFields = {
  project: {
    name: string;
    goal: string;
    summary: string;
    status: PassportV1['project']['status'];
  };
  stack: PassportV1['stack'];
  requirements: PassportV1['requirements'];
  decisions: PassportV1['decisions'];
  completed: PassportV1['completed'];
  tasks: PassportV1['tasks'];
  bugs: PassportV1['bugs'];
  bugsReviewed: boolean;
  instructions: string[];
  nextAction: string;
  openQuestions: string[];
};

/**
 * Extracts ONLY the editor-owned fields from a passport object.
 * Used for external-change conflict comparison and safe field updates.
 */
export function editorFieldsOf(passport: PassportV1): EditorOwnedFields {
  return {
    project: {
      name: passport.project.name,
      goal: passport.project.goal,
      summary: passport.project.summary,
      status: passport.project.status,
    },
    stack: passport.stack.map((item) => ({ ...item })),
    requirements: passport.requirements.map((item) => ({ ...item })),
    decisions: passport.decisions.map((item) => ({ ...item })),
    completed: passport.completed.map((item) => ({ ...item })),
    tasks: passport.tasks.map((item) => ({ ...item })),
    bugs: passport.bugs.map((item) => ({ ...item })),
    bugsReviewed: Boolean(passport.bugsReviewed),
    instructions: [...passport.instructions],
    nextAction: passport.nextAction,
    openQuestions: [...passport.openQuestions],
  };
}

/**
 * Applies ONLY the editor-owned fields from `draft` onto `latest`.
 *
 * Editor-owned fields:
 * - project name, goal, summary, status
 * - stack, requirements, decisions, completed, tasks, bugs, bugsReviewed
 * - instructions, nextAction, openQuestions
 *
 * Preserved from `latest`:
 * - files, conversations
 * - project.id, project.createdAt
 * - schemaVersion
 *
 * This prevents the passport editor from overwriting files or conversations
 * managed in other tabs or background slices.
 */
export function applyEditorFields(latest: PassportV1, draft: PassportV1): PassportV1 {
  const editorFields = editorFieldsOf(draft);
  return {
    ...latest,
    schemaVersion: latest.schemaVersion,
    project: {
      ...latest.project,
      id: latest.project.id,
      createdAt: latest.project.createdAt,
      name: editorFields.project.name,
      goal: editorFields.project.goal,
      summary: editorFields.project.summary,
      status: editorFields.project.status,
    },
    stack: editorFields.stack,
    requirements: editorFields.requirements,
    decisions: editorFields.decisions,
    completed: editorFields.completed,
    tasks: editorFields.tasks,
    bugs: editorFields.bugs,
    bugsReviewed: editorFields.bugsReviewed,
    instructions: editorFields.instructions,
    nextAction: editorFields.nextAction,
    openQuestions: editorFields.openQuestions,
    files: latest.files.map((file) => ({ ...file })),
    conversations: latest.conversations.map((conv) => ({ ...conv })),
  };
}
