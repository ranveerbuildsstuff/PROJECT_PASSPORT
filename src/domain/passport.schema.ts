import { z } from 'zod';

export const ProjectStatusSchema = z.enum([
  'idea',
  'in_progress',
  'paused',
  'done',
]);

export const StackItemSchema = z.object({
  name: z.string().min(1, 'Stack item name cannot be empty'),
  role: z.string().optional(),
  version: z.string().optional(),
  notes: z.string().optional(),
});

export const RequirementPrioritySchema = z.enum(['must', 'should', 'could']);

export const RequirementSchema = z.object({
  id: z.string().min(1, 'Requirement ID is required'),
  text: z.string().min(1, 'Requirement text cannot be empty'),
  priority: RequirementPrioritySchema,
});

export const DecisionStatusSchema = z.enum(['active', 'superseded']);

export const DecisionSchema = z.object({
  id: z.string().min(1, 'Decision ID is required'),
  decision: z.string().min(1, 'Decision text cannot be empty'),
  reason: z.string().min(1, 'Decision reason cannot be empty'),
  date: z.string().optional(),
  status: DecisionStatusSchema,
});

export const CompletedItemSchema = z.object({
  id: z.string().min(1, 'Completed item ID is required'),
  text: z.string().min(1, 'Completed item text cannot be empty'),
});

export const TaskStatusSchema = z.enum(['todo', 'doing', 'blocked', 'done']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high']);

export const TaskSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
  text: z.string().min(1, 'Task description cannot be empty'),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
});

export const BugSeveritySchema = z.enum(['low', 'medium', 'high']);
export const BugStatusSchema = z.enum(['open', 'fixed']);

export const BugSchema = z.object({
  id: z.string().min(1, 'Bug ID is required'),
  text: z.string().min(1, 'Bug description cannot be empty'),
  severity: BugSeveritySchema,
  status: BugStatusSchema,
});

export const FileManifestItemSchema = z.object({
  path: z.string().min(1, 'File path cannot be empty'),
  purpose: z.string(),
  included: z.boolean(),
  sizeBytes: z.number().nonnegative(),
});

export const ConversationSourceSchema = z.enum([
  'chatgpt',
  'claude',
  'gemini',
  'paste',
  'other',
]);

export const ConversationRefSchema = z.object({
  id: z.string().min(1, 'Conversation ID is required'),
  title: z.string().min(1, 'Conversation title cannot be empty'),
  source: ConversationSourceSchema,
  messageCount: z.number().int().nonnegative(),
  tokenEstimate: z.number().int().nonnegative(),
  included: z.boolean(),
});

export const ProjectMetadataSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  name: z.string().min(1, 'Project name cannot be empty'),
  goal: z.string(),
  summary: z.string(),
  status: ProjectStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PassportSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  project: ProjectMetadataSchema,
  stack: z.array(StackItemSchema),
  requirements: z.array(RequirementSchema),
  decisions: z.array(DecisionSchema),
  completed: z.array(CompletedItemSchema),
  tasks: z.array(TaskSchema),
  bugs: z.array(BugSchema),
  bugsReviewed: z.boolean().default(false),
  instructions: z.array(z.string()),
  files: z.array(FileManifestItemSchema),
  conversations: z.array(ConversationRefSchema),
  nextAction: z.string(),
  openQuestions: z.array(z.string()),
});

export type PassportV1 = z.infer<typeof PassportSchemaV1>;
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;
export type StackItem = z.infer<typeof StackItemSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type CompletedItem = z.infer<typeof CompletedItemSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Bug = z.infer<typeof BugSchema>;
export type FileManifestItem = z.infer<typeof FileManifestItemSchema>;
export type ConversationRef = z.infer<typeof ConversationRefSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type BugSeverity = z.infer<typeof BugSeveritySchema>;
export type BugStatus = z.infer<typeof BugStatusSchema>;
export type ConversationSource = z.infer<typeof ConversationSourceSchema>;

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
}

const FIELD_LABELS: Record<string, string> = {
  project: 'Project',
  stack: 'Stack',
  requirements: 'Requirements',
  decisions: 'Decisions',
  completed: 'Completed',
  tasks: 'Tasks',
  bugs: 'Bugs',
  bugsReviewed: 'Bugs reviewed',
  instructions: 'Instructions',
  files: 'Files',
  conversations: 'Conversations',
  nextAction: 'Next action',
  openQuestions: 'Open questions',
};

const ARRAY_FIELDS = new Set([
  'stack',
  'requirements',
  'decisions',
  'completed',
  'tasks',
  'bugs',
  'instructions',
  'files',
  'conversations',
  'openQuestions',
]);

export function formatZodIssueToPlainLanguage(issue: z.ZodIssue): string {
  const path = issue.path;
  const first = path[0];
  const second = path[1];
  const third = path[2];

  if (first === 'bugsReviewed') {
    return 'Bugs reviewed must be true or false';
  }

  if (first === 'nextAction' && issue.code === 'invalid_type' && issue.expected === 'string') {
    return 'Next action must be text';
  }

  if (
    path.length === 1 &&
    issue.code === 'invalid_type' &&
    ARRAY_FIELDS.has(String(first)) &&
    issue.expected === 'array'
  ) {
    const label = FIELD_LABELS[String(first)] || String(first);
    return `${label} must be a list`;
  }

  if (first === 'project') {
    if (path.length === 1 && issue.code === 'invalid_type') {
      return 'Project must be an object';
    }
    if (second === 'name') return 'Project name cannot be empty';
    if (second === 'status') return 'Project status must be one of: idea, in_progress, paused, done';
    if (second === 'id') return 'Project ID is missing';
    if (second === 'goal') return 'Project goal must be text';
    if (second === 'summary') return 'Project summary must be text';
    if (second === 'createdAt') return 'Project creation date must be text';
    if (second === 'updatedAt') return 'Project update date must be text';
    return `Project ${String(second || 'metadata')} is invalid`;
  }

  if (first === 'tasks' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Task ${itemNum} needs some text`;
    if (third === 'status') return `Task ${itemNum} has an invalid status`;
    if (third === 'priority') return `Task ${itemNum} has an invalid priority`;
    if (third === 'id') return `Task ${itemNum} ID is missing`;
    return `Task ${itemNum} is invalid`;
  }

  if (first === 'bugs' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Bug ${itemNum} needs a description`;
    if (third === 'severity') return `Bug ${itemNum} has an invalid severity`;
    if (third === 'status') return `Bug ${itemNum} has an invalid status`;
    if (third === 'id') return `Bug ${itemNum} ID is missing`;
    return `Bug ${itemNum} is invalid`;
  }

  if (first === 'decisions' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'decision') return `Decision ${itemNum} needs a description`;
    if (third === 'reason') return `Decision ${itemNum} needs a reason`;
    if (third === 'status') return `Decision ${itemNum} has an invalid status`;
    if (third === 'date') return `Decision ${itemNum} date must be text`;
    if (third === 'id') return `Decision ${itemNum} ID is missing`;
    return `Decision ${itemNum} is invalid`;
  }

  if (first === 'stack' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'name') return `Stack item ${itemNum} needs a name`;
    if (third === 'role') return `Stack item ${itemNum} role must be text`;
    if (third === 'version') return `Stack item ${itemNum} version must be text`;
    if (third === 'notes') return `Stack item ${itemNum} notes must be text`;
    return `Stack item ${itemNum} is invalid`;
  }

  if (first === 'requirements' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Requirement ${itemNum} needs some text`;
    if (third === 'priority') return `Requirement ${itemNum} has an invalid priority`;
    if (third === 'id') return `Requirement ${itemNum} ID is missing`;
    return `Requirement ${itemNum} is invalid`;
  }

  if (first === 'completed' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'text') return `Completed item ${itemNum} needs some text`;
    if (third === 'id') return `Completed item ${itemNum} ID is missing`;
    return `Completed item ${itemNum} is invalid`;
  }

  if (first === 'files' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'path') return `File ${itemNum} is missing a path`;
    if (third === 'sizeBytes') return `File ${itemNum} has an invalid size`;
    if (third === 'included') return `File ${itemNum} included must be true or false`;
    if (third === 'purpose') return `File ${itemNum} purpose must be text`;
    return `File ${itemNum} is invalid`;
  }

  if (first === 'conversations' && typeof second === 'number') {
    const itemNum = second + 1;
    if (third === 'title') return `Conversation ${itemNum} is missing a title`;
    if (third === 'source') return `Conversation ${itemNum} has an invalid source`;
    if (third === 'messageCount') return `Conversation ${itemNum} message count must be a number`;
    if (third === 'tokenEstimate') return `Conversation ${itemNum} token estimate must be a number`;
    if (third === 'included') return `Conversation ${itemNum} included must be true or false`;
    if (third === 'id') return `Conversation ${itemNum} ID is missing`;
    return `Conversation ${itemNum} is invalid`;
  }

  if (first === 'openQuestions' && typeof second === 'number') {
    const itemNum = second + 1;
    return `Open question ${itemNum} must be text`;
  }

  if (first === 'instructions' && typeof second === 'number') {
    const itemNum = second + 1;
    return `Instruction ${itemNum} must be text`;
  }

  if (first === 'schemaVersion') {
    return 'Unsupported or missing schema version (expected version 1)';
  }

  if (issue.code === 'invalid_type' && issue.received === 'undefined' && path.length === 1) {
    const label = FIELD_LABELS[String(first)] || String(first);
    return `${label} section is missing`;
  }

  if (path.length === 1 && issue.code === 'invalid_type') {
    const label = FIELD_LABELS[String(first)] || String(first);
    if (issue.expected === 'string') return `${label} must be text`;
    if (issue.expected === 'boolean') return `${label} must be true or false`;
    if (issue.expected === 'number') return `${label} must be a number`;
    if (issue.expected === 'array') return `${label} must be a list`;
    if (issue.expected === 'object') return `${label} must be an object`;
  }

  const pathStr = path.length > 0 ? path.join('.') : 'root';
  return `The field "${pathStr}" has an invalid value`;
}

export function validatePassport(data: unknown): ValidationResult<PassportV1> {
  if (data === null || typeof data !== 'object') {
    return {
      success: false,
      errors: ['Input must be a valid passport object'],
    };
  }

  const parsed = PassportSchemaV1.safeParse(data);
  if (parsed.success) {
    return {
      success: true,
      data: parsed.data,
      errors: [],
    };
  }

  const errors = parsed.error.issues.map(formatZodIssueToPlainLanguage);
  return {
    success: false,
    errors,
  };
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createEmptyPassport(name = 'Untitled Project'): PassportV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    project: {
      id: generateUUID(),
      name,
      goal: '',
      summary: '',
      status: 'in_progress',
      createdAt: now,
      updatedAt: now,
    },
    stack: [],
    requirements: [],
    decisions: [],
    completed: [],
    tasks: [],
    bugs: [],
    bugsReviewed: false,
    instructions: [],
    files: [],
    conversations: [],
    nextAction: '',
    openQuestions: [],
  };
}
