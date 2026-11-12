import { z } from 'zod';
import {
  PassportSchemaV1,
  ProjectStatusSchema,
  RequirementPrioritySchema,
  DecisionStatusSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  BugSeveritySchema,
  BugStatusSchema,
  type ProjectStatus,
  type RequirementPriority,
  type DecisionStatus,
  type TaskStatus,
  type TaskPriority,
  type BugSeverity,
  type BugStatus,
  type StackItem,
  type Requirement,
  type Decision,
  type CompletedItem,
  type Task,
  type Bug,
} from './passport.schema';
import { newId } from './editor';

/**
 * The 10 editor-owned sections that can be imported and merged.
 */
export const MERGE_SECTION_IDS = [
  'basics',
  'stack',
  'requirements',
  'decisions',
  'completed',
  'tasks',
  'bugs',
  'instructions',
  'nextAction',
  'openQuestions',
] as const;

export type MergeSectionId = (typeof MERGE_SECTION_IDS)[number];

/**
 * PassportImportSchema derived from PassportSchemaV1.
 * Covers editor-owned sections only, every section optional, item id optional.
 * Zero duplicated field lists.
 */
export const PassportImportSchema = z.object({
  project: PassportSchemaV1.shape.project
    .omit({ id: true, createdAt: true, updatedAt: true })
    .partial()
    .optional(),
  stack: z.array(PassportSchemaV1.shape.stack.element).optional(),
  requirements: z
    .array(PassportSchemaV1.shape.requirements.element.partial({ id: true }))
    .optional(),
  decisions: z
    .array(PassportSchemaV1.shape.decisions.element.partial({ id: true }))
    .optional(),
  completed: z
    .array(PassportSchemaV1.shape.completed.element.partial({ id: true }))
    .optional(),
  tasks: z
    .array(PassportSchemaV1.shape.tasks.element.partial({ id: true }))
    .optional(),
  bugs: z
    .array(PassportSchemaV1.shape.bugs.element.partial({ id: true }))
    .optional(),
  bugsReviewed: PassportSchemaV1.shape.bugsReviewed.optional(),
  instructions: PassportSchemaV1.shape.instructions.optional(),
  nextAction: PassportSchemaV1.shape.nextAction.optional(),
  openQuestions: PassportSchemaV1.shape.openQuestions.optional(),
});

export type PassportImport = z.infer<typeof PassportImportSchema>;

export interface ImportedBasics {
  name?: string;
  goal?: string;
  summary?: string;
  status?: ProjectStatus;
}

export type ImportedBugs = Bug[] & {
  items: Bug[];
  bugsReviewed: boolean;
};

export interface ImportedSections {
  basics?: ImportedBasics;
  project?: ImportedBasics;
  stack?: StackItem[];
  requirements?: Requirement[];
  decisions?: Decision[];
  completed?: CompletedItem[];
  tasks?: Task[];
  bugs?: ImportedBugs;
  bugsReviewed?: boolean;
  instructions?: string[];
  nextAction?: string;
  openQuestions?: string[];
}

export interface NormalizedImportResult {
  sections: ImportedSections;
  presentSections: MergeSectionId[];
  ignoredKeys: string[];
  notes: string[];
  issues: string[];
}

/**
 * Case-insensitive enum coercion converting spaces and hyphens into underscores.
 */
function coerceEnum<T extends string>(
  rawVal: unknown,
  allowedValues: readonly T[]
): T | unknown {
  if (typeof rawVal !== 'string') {
    return rawVal;
  }
  const normalized = rawVal.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const match = (allowedValues as readonly string[]).find(
    (v) => v === normalized || v.replace(/_/g, '') === normalized.replace(/_/g, '')
  );
  if (match) {
    return match as T;
  }
  return rawVal.trim();
}

/**
 * Trims string or converts null to undefined.
 */
function trimOrOmit(val: unknown): string | undefined {
  if (val === null || val === undefined) {
    return undefined;
  }
  if (typeof val === 'string') {
    return val.trim();
  }
  return String(val);
}

/**
 * Formats a validation issue into plain language strictly adhering to forbidden patterns.
 * Never outputs: /invalid_|Expected|undefined|\[object|ZodError|\{/
 */
export function formatImportIssueToPlainLanguage(issue: z.ZodIssue): string {
  const path = issue.path;
  const first = path[0];
  const second = path[1];
  const third = path[2];

  if (first === 'bugsReviewed') {
    return 'Bugs reviewed must be true or false';
  }

  if (first === 'nextAction' && issue.code === 'invalid_type') {
    return 'Next action must be text';
  }

  if (first === 'project') {
    if (second === 'name') return 'Project name cannot be empty';
    if (second === 'status') {
      const allowed = ProjectStatusSchema.options.join(', ');
      return `Project status must be one of: ${allowed}`;
    }
    if (second === 'goal') return 'Project goal must be text';
    if (second === 'summary') return 'Project summary must be text';
    return `Project details have an invalid value`;
  }

  if (first === 'tasks' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Task ${itemNum} needs some text`;
    if (third === 'status') {
      const allowed = TaskStatusSchema.options.join(', ');
      return `Task ${itemNum} has an invalid status. Use one of: ${allowed}`;
    }
    if (third === 'priority') {
      const allowed = TaskPrioritySchema.options.join(', ');
      return `Task ${itemNum} has an invalid priority. Use one of: ${allowed}`;
    }
    return `Task ${itemNum} has an invalid value`;
  }

  if (first === 'bugs' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Bug ${itemNum} needs a description`;
    if (third === 'severity') {
      const allowed = BugSeveritySchema.options.join(', ');
      return `Bug ${itemNum} has an invalid severity. Use one of: ${allowed}`;
    }
    if (third === 'status') {
      const allowed = BugStatusSchema.options.join(', ');
      return `Bug ${itemNum} has an invalid status. Use one of: ${allowed}`;
    }
    return `Bug ${itemNum} has an invalid value`;
  }

  if (first === 'decisions' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'decision') return `Decision ${itemNum} needs a description`;
    if (third === 'reason') return `Decision ${itemNum} needs a reason`;
    if (third === 'status') {
      const allowed = DecisionStatusSchema.options.join(', ');
      return `Decision ${itemNum} has an invalid status. Use one of: ${allowed}`;
    }
    if (third === 'date') return `Decision ${itemNum} date must be text`;
    return `Decision ${itemNum} has an invalid value`;
  }

  if (first === 'stack' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'name') return `Stack item ${itemNum} needs a name`;
    if (third === 'role') return `Stack item ${itemNum} role must be text`;
    if (third === 'version') return `Stack item ${itemNum} version must be text`;
    if (third === 'notes') return `Stack item ${itemNum} notes must be text`;
    return `Stack item ${itemNum} has an invalid value`;
  }

  if (first === 'requirements' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Requirement ${itemNum} needs some text`;
    if (third === 'priority') {
      const allowed = RequirementPrioritySchema.options.join(', ');
      return `Requirement ${itemNum} has an invalid priority. Use one of: ${allowed}`;
    }
    return `Requirement ${itemNum} has an invalid value`;
  }

  if (first === 'completed' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Completed item ${itemNum} needs some text`;
    return `Completed item ${itemNum} has an invalid value`;
  }

  if (first === 'openQuestions' && typeof second === 'number') {
    const itemNum = second + 1;
    return `Open question ${itemNum} must be text`;
  }

  if (first === 'instructions' && typeof second === 'number') {
    const itemNum = second + 1;
    return `Instruction ${itemNum} must be text`;
  }

  const field = path.length > 0 ? path.join('.') : 'passport';
  return `The ${field} field has an invalid format`;
}

/**
 * Normalizes imported passport data applying allowed coercions, generating missing/duplicate IDs,
 * tracking ignored keys, and collecting validation issues.
 */
export function normalizeImportedPassport(
  rawInput: unknown,
  idFactory: () => string = newId
): NormalizedImportResult {
  const presentSectionsSet = new Set<MergeSectionId>();
  const ignoredKeys: string[] = [];
  const notes: string[] = [];
  const issues: string[] = [];

  if (rawInput === null || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      sections: {},
      presentSections: [],
      ignoredKeys: [],
      notes: [],
      issues: ['Input must be a valid passport object'],
    };
  }

  // One-level unwrap of {"passport": {...}}
  let raw: Record<string, unknown> = rawInput as Record<string, unknown>;
  if (
    'passport' in raw &&
    typeof raw.passport === 'object' &&
    raw.passport !== null &&
    !Array.isArray(raw.passport)
  ) {
    raw = raw.passport as Record<string, unknown>;
  }

  // schemaVersion check
  if ('schemaVersion' in raw && raw.schemaVersion !== null && raw.schemaVersion !== undefined) {
    if (raw.schemaVersion !== 1) {
      return {
        sections: {},
        presentSections: [],
        ignoredKeys: [],
        notes: [],
        issues: [`This reply uses passport version ${raw.schemaVersion}. This app reads version 1.`],
      };
    }
    ignoredKeys.push('schemaVersion');
  }

  // Check top-level ignored keys
  if ('files' in raw && raw.files !== null && raw.files !== undefined) {
    ignoredKeys.push('files');
  }
  if ('conversations' in raw && raw.conversations !== null && raw.conversations !== undefined) {
    ignoredKeys.push('conversations');
  }
  if ('createdAt' in raw && raw.createdAt !== null && raw.createdAt !== undefined) {
    ignoredKeys.push('createdAt');
  }
  if ('updatedAt' in raw && raw.updatedAt !== null && raw.updatedAt !== undefined) {
    ignoredKeys.push('updatedAt');
  }
  if ('id' in raw && raw.id !== null && raw.id !== undefined) {
    ignoredKeys.push('project.id');
  }

  const KNOWN_TOP_LEVEL_KEYS = new Set([
    'passport',
    'schemaVersion',
    'project',
    'basics',
    'stack',
    'requirements',
    'decisions',
    'completed',
    'tasks',
    'bugs',
    'bugsReviewed',
    'instructions',
    'nextAction',
    'openQuestions',
    'files',
    'conversations',
    'createdAt',
    'updatedAt',
    'id',
  ]);

  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      ignoredKeys.push(key);
    }
  }

  const seenIds = new Set<string>();
  const resolveId = (existingId: unknown): string => {
    if (typeof existingId === 'string' && existingId.trim().length > 0) {
      const trimmed = existingId.trim();
      if (!seenIds.has(trimmed)) {
        seenIds.add(trimmed);
        return trimmed;
      }
    }
    const generated = idFactory();
    seenIds.add(generated);
    return generated;
  };

  const sections: ImportedSections = {};

  // 1. Basics (from raw.project or raw.basics)
  const rawProject = raw.project ?? raw.basics;
  if (rawProject !== null && rawProject !== undefined && typeof rawProject === 'object') {
    presentSectionsSet.add('basics');
    const p = rawProject as Record<string, unknown>;

    // Ignored keys in project metadata
    if ('id' in p && p.id !== null && p.id !== undefined && !ignoredKeys.includes('project.id')) {
      ignoredKeys.push('project.id');
    }
    if ('createdAt' in p && p.createdAt !== null && p.createdAt !== undefined && !ignoredKeys.includes('createdAt')) {
      ignoredKeys.push('createdAt');
    }
    if ('updatedAt' in p && p.updatedAt !== null && p.updatedAt !== undefined && !ignoredKeys.includes('updatedAt')) {
      ignoredKeys.push('updatedAt');
    }
    for (const key of Object.keys(p)) {
      if (!['id', 'name', 'goal', 'summary', 'status', 'createdAt', 'updatedAt'].includes(key)) {
        ignoredKeys.push(`project.${key}`);
      }
    }

    const basics: ImportedBasics = {};
    if (p.name !== null && p.name !== undefined) {
      basics.name = trimOrOmit(p.name);
    }
    if (p.goal !== null && p.goal !== undefined) {
      basics.goal = trimOrOmit(p.goal);
    }
    if (p.summary !== null && p.summary !== undefined) {
      basics.summary = trimOrOmit(p.summary);
    }
    if (p.status !== null && p.status !== undefined) {
      basics.status = coerceEnum(p.status, ProjectStatusSchema.options) as ProjectStatus;
    }

    sections.basics = basics;
    sections.project = basics;
  }

  // 2. Stack
  if (raw.stack !== null && raw.stack !== undefined) {
    presentSectionsSet.add('stack');
    if (Array.isArray(raw.stack)) {
      const stackList: StackItem[] = [];
      for (const item of raw.stack) {
        if (item === null || typeof item !== 'object') continue;
        const name = trimOrOmit(item.name);
        if (!name) {
          notes.push('Dropped empty stack item');
          continue;
        }
        const entry: StackItem = { name };
        const role = trimOrOmit(item.role);
        if (role) entry.role = role;
        const version = trimOrOmit(item.version);
        if (version) entry.version = version;
        const itemNotes = trimOrOmit(item.notes);
        if (itemNotes) entry.notes = itemNotes;
        stackList.push(entry);
      }
      sections.stack = stackList;
    }
  }

  // 3. Requirements
  if (raw.requirements !== null && raw.requirements !== undefined) {
    presentSectionsSet.add('requirements');
    if (Array.isArray(raw.requirements)) {
      const reqList: Requirement[] = [];
      for (const item of raw.requirements) {
        if (item === null || typeof item !== 'object') continue;
        const text = trimOrOmit(item.text);
        if (!text) {
          notes.push('Dropped empty requirement');
          continue;
        }
        const priority = (coerceEnum(item.priority, RequirementPrioritySchema.options) as RequirementPriority) || 'should';
        reqList.push({
          id: resolveId(item.id),
          text,
          priority,
        });
      }
      sections.requirements = reqList;
    }
  }

  // 4. Decisions
  if (raw.decisions !== null && raw.decisions !== undefined) {
    presentSectionsSet.add('decisions');
    if (Array.isArray(raw.decisions)) {
      const decisionList: Decision[] = [];
      for (const item of raw.decisions) {
        if (item === null || typeof item !== 'object') continue;
        const decisionText = trimOrOmit(item.decision);
        if (!decisionText) {
          notes.push('Dropped empty decision');
          continue;
        }
        const reason = trimOrOmit(item.reason) ?? '';
        const status = (coerceEnum(item.status, DecisionStatusSchema.options) as DecisionStatus) || 'active';
        const entry: Decision = {
          id: resolveId(item.id),
          decision: decisionText,
          reason,
          status,
        };
        const date = trimOrOmit(item.date);
        if (date) entry.date = date;
        decisionList.push(entry);
      }
      sections.decisions = decisionList;
    }
  }

  // 5. Completed
  if (raw.completed !== null && raw.completed !== undefined) {
    presentSectionsSet.add('completed');
    if (Array.isArray(raw.completed)) {
      const completedList: CompletedItem[] = [];
      for (const item of raw.completed) {
        if (item === null || typeof item !== 'object') continue;
        const text = trimOrOmit(item.text);
        if (!text) {
          notes.push('Dropped empty completed item');
          continue;
        }
        completedList.push({
          id: resolveId(item.id),
          text,
        });
      }
      sections.completed = completedList;
    }
  }

  // 6. Tasks
  if (raw.tasks !== null && raw.tasks !== undefined) {
    presentSectionsSet.add('tasks');
    if (Array.isArray(raw.tasks)) {
      const taskList: Task[] = [];
      for (const item of raw.tasks) {
        if (item === null || typeof item !== 'object') continue;
        const text = trimOrOmit(item.text);
        if (!text) {
          notes.push('Dropped empty task');
          continue;
        }
        const status = (coerceEnum(item.status, TaskStatusSchema.options) as TaskStatus) || 'todo';
        const priority = (coerceEnum(item.priority, TaskPrioritySchema.options) as TaskPriority) || 'medium';
        taskList.push({
          id: resolveId(item.id),
          text,
          status,
          priority,
        });
      }
      sections.tasks = taskList;
    }
  }

  // 7. Bugs & bugsReviewed
  const hasBugs = raw.bugs !== null && raw.bugs !== undefined;
  const hasReviewed = raw.bugsReviewed !== null && raw.bugsReviewed !== undefined;
  if (hasBugs || hasReviewed) {
    presentSectionsSet.add('bugs');
    let reviewed = false;
    if (raw.bugsReviewed === 'true' || raw.bugsReviewed === true) {
      reviewed = true;
    } else if (raw.bugsReviewed === 'false' || raw.bugsReviewed === false) {
      reviewed = false;
    }

    const bugList: Bug[] = [];
    if (Array.isArray(raw.bugs)) {
      for (const item of raw.bugs) {
        if (item === null || typeof item !== 'object') continue;
        const text = trimOrOmit(item.text);
        if (!text) {
          notes.push('Dropped empty bug');
          continue;
        }
        const severity = (coerceEnum(item.severity, BugSeveritySchema.options) as BugSeverity) || 'medium';
        const status = (coerceEnum(item.status, BugStatusSchema.options) as BugStatus) || 'open';
        bugList.push({
          id: resolveId(item.id),
          text,
          severity,
          status,
        });
      }
    }

    const bugsCombined = [...bugList] as ImportedBugs;
    bugsCombined.items = bugList;
    bugsCombined.bugsReviewed = reviewed;

    sections.bugs = bugsCombined;
    sections.bugsReviewed = reviewed;
  }

  // 8. Instructions
  if (raw.instructions !== null && raw.instructions !== undefined) {
    presentSectionsSet.add('instructions');
    let rawInstr = raw.instructions;
    if (typeof rawInstr === 'string') {
      rawInstr = [rawInstr];
    }
    if (Array.isArray(rawInstr)) {
      const instructionsList: string[] = [];
      for (const item of rawInstr) {
        const text = trimOrOmit(item);
        if (!text) {
          notes.push('Dropped empty instruction');
          continue;
        }
        instructionsList.push(text);
      }
      sections.instructions = instructionsList;
    }
  }

  // 9. Next Action
  if (raw.nextAction !== null && raw.nextAction !== undefined) {
    presentSectionsSet.add('nextAction');
    sections.nextAction = trimOrOmit(raw.nextAction) ?? '';
  }

  // 10. Open Questions
  if (raw.openQuestions !== null && raw.openQuestions !== undefined) {
    presentSectionsSet.add('openQuestions');
    let rawQ = raw.openQuestions;
    if (typeof rawQ === 'string') {
      rawQ = [rawQ];
    }
    if (Array.isArray(rawQ)) {
      const questionList: string[] = [];
      for (const item of rawQ) {
        const text = trimOrOmit(item);
        if (!text) {
          notes.push('Dropped empty open question');
          continue;
        }
        questionList.push(text);
      }
      sections.openQuestions = questionList;
    }
  }

  // Validate normalized fields against PassportImportSchema
  const validationPayload: Record<string, unknown> = {};
  if (sections.basics) validationPayload.project = sections.basics;
  if (sections.stack) validationPayload.stack = sections.stack;
  if (sections.requirements) validationPayload.requirements = sections.requirements;
  if (sections.decisions) validationPayload.decisions = sections.decisions;
  if (sections.completed) validationPayload.completed = sections.completed;
  if (sections.tasks) validationPayload.tasks = sections.tasks;
  if (sections.bugs) validationPayload.bugs = sections.bugs.items;
  if (sections.bugsReviewed !== undefined) validationPayload.bugsReviewed = sections.bugsReviewed;
  if (sections.instructions) validationPayload.instructions = sections.instructions;
  if (sections.nextAction !== undefined) validationPayload.nextAction = sections.nextAction;
  if (sections.openQuestions) validationPayload.openQuestions = sections.openQuestions;

  const parsed = PassportImportSchema.safeParse(validationPayload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push(formatImportIssueToPlainLanguage(issue));
    }
  }

  return {
    sections,
    presentSections: Array.from(presentSectionsSet),
    ignoredKeys,
    notes,
    issues,
  };
}
