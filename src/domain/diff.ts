/**
 * Pure, deterministic diff engine for Passports and Checkpoints.
 *
 * Invariants:
 * - Depends ONLY on domain types and pure utilities (no React, Dexie, DOM APIs).
 * - Zero console logging, never throws.
 * - Deterministic output.
 * - diff(a, a) has no changes.
 * - diff(a, b).added === diff(b, a).removed for all sections.
 * - Identifies reordered lists when items are identical but order differs.
 * - Handles legacy checkpoints lacking files/conversations via notRecorded: true.
 */

import type {
  PassportV1,
  StackItem,
  Requirement,
  Decision,
  CompletedItem,
  Task,
  Bug,
  FileManifestItem,
  ConversationRef,
} from './passport.schema';
import type { CheckpointFileItem, CheckpointRecordModel } from './checkpoint';
import { normalizeText } from './merge';

export type DiffSectionId =
  | 'basics'
  | 'stack'
  | 'requirements'
  | 'decisions'
  | 'completed'
  | 'tasks'
  | 'bugs'
  | 'instructions'
  | 'nextAction'
  | 'openQuestions'
  | 'files'
  | 'conversations';

export interface FieldChange<T = unknown> {
  field: string;
  before: T;
  after: T;
}

export interface ItemChange<T = unknown> {
  id: string;
  label: string;
  before: T;
  after: T;
  changedFields: FieldChange[];
  contentChanged?: boolean;
}

export interface SectionDiff<T = unknown> {
  sectionId: DiffSectionId;
  title: string;
  added: T[];
  removed: T[];
  changed: ItemChange<T>[];
  reordered?: boolean;
  notRecorded?: boolean;
  summary: string;
  hasChanges: boolean;
}

export interface BasicFieldItem {
  field: string;
  value: string;
}

export interface NextActionItem {
  id: string;
  value: string;
}

export type FileItem = CheckpointFileItem | FileManifestItem;

export interface ConversationItem {
  id: string;
  title: string;
  source?: string;
  messageCount?: number;
  tokenEstimate?: number;
  included?: boolean;
}

export interface PassportDiffSections {
  basics: SectionDiff<BasicFieldItem>;
  stack: SectionDiff<StackItem>;
  requirements: SectionDiff<Requirement>;
  decisions: SectionDiff<Decision>;
  completed: SectionDiff<CompletedItem>;
  tasks: SectionDiff<Task>;
  bugs: SectionDiff<Bug>;
  instructions: SectionDiff<string>;
  nextAction: SectionDiff<NextActionItem>;
  openQuestions: SectionDiff<string>;
  files: SectionDiff<FileItem>;
  conversations: SectionDiff<ConversationItem>;
}

export interface PassportDiff {
  sections: PassportDiffSections;
  totalChanges: number;
  hasChanges: boolean;
  summary: string;
}

export interface DiffSourceMeta {
  files?: CheckpointFileItem[] | FileManifestItem[];
  conversationIds?: string[];
  conversations?: ConversationRef[];
  isLegacy?: boolean;
}

export type DiffableSource =
  | PassportV1
  | CheckpointRecordModel
  | {
      passport: PassportV1;
      files?: CheckpointFileItem[] | FileManifestItem[];
      conversationIds?: string[];
      conversations?: ConversationRef[];
      isLegacy?: boolean;
      id?: string;
      createdAt?: string;
    };

export interface DiffOptions {
  fromMeta?: DiffSourceMeta;
  toMeta?: DiffSourceMeta;
}

interface ResolvedSource {
  passport: PassportV1;
  files?: CheckpointFileItem[] | FileManifestItem[];
  conversationIds?: string[];
  conversations?: ConversationRef[];
  isFilesLegacy: boolean;
  isConversationsLegacy: boolean;
}

function resolveSource(source: DiffableSource, metaOverride?: DiffSourceMeta): ResolvedSource {
  let passport: PassportV1;
  let files: CheckpointFileItem[] | FileManifestItem[] | undefined;
  let conversationIds: string[] | undefined;
  let conversations: ConversationRef[] | undefined;
  let isFilesLegacy = false;
  let isConversationsLegacy = false;

  if ('passport' in source && source.passport) {
    // CheckpointRecord, CheckpointRecordModel, or wrapped source
    passport = source.passport;
    files = source.files !== undefined ? source.files : source.passport.files;
    conversationIds = source.conversationIds !== undefined
      ? source.conversationIds
      : source.passport.conversations?.filter((c) => c.included).map((c) => c.id);

    // Detect legacy checkpoints: created before files/conversationIds tracking
    const isCheckpoint = 'id' in source && 'createdAt' in source;
    if (isCheckpoint) {
      if (source.files === undefined) isFilesLegacy = true;
      if (source.conversationIds === undefined) isConversationsLegacy = true;
    }
  } else {
    // It's a PassportV1 directly
    const p = source as PassportV1;
    passport = p;
    files = p.files;
    conversations = p.conversations;
    conversationIds = p.conversations
      ? p.conversations.filter((c) => c.included).map((c) => c.id)
      : undefined;
  }

  if (metaOverride) {
    if (metaOverride.files !== undefined) files = metaOverride.files;
    if (metaOverride.conversationIds !== undefined) conversationIds = metaOverride.conversationIds;
    if (metaOverride.conversations !== undefined) conversations = metaOverride.conversations;
    if (metaOverride.isLegacy) {
      isFilesLegacy = true;
      isConversationsLegacy = true;
    }
  }

  return {
    passport,
    files,
    conversationIds,
    conversations,
    isFilesLegacy,
    isConversationsLegacy,
  };
}

function formatSectionSummary(
  addedCount: number,
  changedCount: number,
  removedCount: number,
  reordered?: boolean
): string {
  const parts: string[] = [];
  if (addedCount > 0) parts.push(`${addedCount} added`);
  if (changedCount > 0) parts.push(`${changedCount} changed`);
  if (removedCount > 0) parts.push(`${removedCount} removed`);

  if (parts.length === 0) {
    return reordered ? 'Reordered (no content changes)' : 'No changes';
  }
  const text = parts.join(', ');
  return reordered ? `${text} (reordered)` : text;
}

/**
 * Pure diff computation between two passport states.
 */
export function diffPassports(
  fromSource: DiffableSource,
  toSource: DiffableSource,
  options?: DiffOptions
): PassportDiff {
  const from = resolveSource(fromSource, options?.fromMeta);
  const to = resolveSource(toSource, options?.toMeta);

  // 1. Basics
  const basicsDiff = diffBasics(from.passport.project, to.passport.project);

  // 2. Stack (matched by normalized name)
  const stackDiff = diffStack(from.passport.stack || [], to.passport.stack || []);

  // 3. Requirements (matched by ID)
  const reqDiff = diffIdList<Requirement>(
    'requirements',
    'Requirements',
    from.passport.requirements || [],
    to.passport.requirements || [],
    (req) => req.text,
    ['text', 'priority']
  );

  // 4. Decisions (matched by ID)
  const decDiff = diffIdList<Decision>(
    'decisions',
    'Decisions',
    from.passport.decisions || [],
    to.passport.decisions || [],
    (dec) => dec.decision,
    ['decision', 'reason', 'date', 'status']
  );

  // 5. Completed (matched by ID)
  const compDiff = diffIdList<CompletedItem>(
    'completed',
    'Completed',
    from.passport.completed || [],
    to.passport.completed || [],
    (comp) => comp.text,
    ['text']
  );

  // 6. Tasks (matched by ID)
  const taskDiff = diffIdList<Task>(
    'tasks',
    'Tasks',
    from.passport.tasks || [],
    to.passport.tasks || [],
    (task) => task.text,
    ['text', 'status', 'priority']
  );

  // 7. Bugs (matched by ID + bugsReviewed)
  const bugDiff = diffBugs(from.passport, to.passport);

  // 8. Instructions (matched by normalized string)
  const instDiff = diffStringList('instructions', 'Instructions', from.passport.instructions || [], to.passport.instructions || []);

  // 9. Next Action
  const nextDiff = diffNextAction(from.passport.nextAction || '', to.passport.nextAction || '');

  // 10. Open Questions (matched by normalized string)
  const oqDiff = diffStringList('openQuestions', 'Open Questions', from.passport.openQuestions || [], to.passport.openQuestions || []);

  // 11. Files
  const fileDiff = diffFiles(from, to);

  // 12. Conversations
  const convDiff = diffConversations(from, to);

  const sections: PassportDiffSections = {
    basics: basicsDiff,
    stack: stackDiff,
    requirements: reqDiff,
    decisions: decDiff,
    completed: compDiff,
    tasks: taskDiff,
    bugs: bugDiff,
    instructions: instDiff,
    nextAction: nextDiff,
    openQuestions: oqDiff,
    files: fileDiff,
    conversations: convDiff,
  };

  let totalChanges = 0;
  let changedSectionsCount = 0;
  for (const key of Object.keys(sections) as DiffSectionId[]) {
    const sec = sections[key];
    if (sec.hasChanges) {
      changedSectionsCount++;
      totalChanges += sec.added.length + sec.removed.length + sec.changed.length;
      if (sec.reordered && sec.added.length === 0 && sec.removed.length === 0 && sec.changed.length === 0) {
        totalChanges += 1;
      }
    }
  }

  const hasChanges = totalChanges > 0;
  let overallSummary = 'No differences between these two versions.';
  if (hasChanges) {
    overallSummary = `${totalChanges} ${totalChanges === 1 ? 'difference' : 'differences'} across ${changedSectionsCount} ${changedSectionsCount === 1 ? 'section' : 'sections'}`;
  }

  return {
    sections,
    totalChanges,
    hasChanges,
    summary: overallSummary,
  };
}

// ---------------- Section Diff Helpers ---------------- //

function diffBasics(fromProject: PassportV1['project'], toProject: PassportV1['project']): SectionDiff<BasicFieldItem> {
  const added: BasicFieldItem[] = [];
  const removed: BasicFieldItem[] = [];
  const changed: ItemChange<BasicFieldItem>[] = [];

  const checkFields: Array<{ field: 'name' | 'status' | 'goal' | 'summary'; label: string; alwaysRequired: boolean }> = [
    { field: 'name', label: 'Project name', alwaysRequired: true },
    { field: 'status', label: 'Project status', alwaysRequired: true },
    { field: 'goal', label: 'Project goal', alwaysRequired: false },
    { field: 'summary', label: 'Project summary', alwaysRequired: false },
  ];

  for (const { field, label, alwaysRequired } of checkFields) {
    const valFrom = (fromProject[field] || '').trim();
    const valTo = (toProject[field] || '').trim();

    if (alwaysRequired) {
      if (valFrom !== valTo) {
        changed.push({
          id: field,
          label,
          before: { field, value: valFrom },
          after: { field, value: valTo },
          changedFields: [{ field, before: valFrom, after: valTo }],
        });
      }
    } else {
      if (!valFrom && valTo) {
        added.push({ field, value: valTo });
      } else if (valFrom && !valTo) {
        removed.push({ field, value: valFrom });
      } else if (valFrom && valTo && valFrom !== valTo) {
        changed.push({
          id: field,
          label,
          before: { field, value: valFrom },
          after: { field, value: valTo },
          changedFields: [{ field, before: valFrom, after: valTo }],
        });
      }
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0;
  return {
    sectionId: 'basics',
    title: 'Basics',
    added,
    removed,
    changed,
    hasChanges,
    summary: formatSectionSummary(added.length, changed.length, removed.length),
  };
}

function diffStack(fromList: StackItem[], toList: StackItem[]): SectionDiff<StackItem> {
  const added: StackItem[] = [];
  const removed: StackItem[] = [];
  const changed: ItemChange<StackItem>[] = [];

  const fromMap = new Map<string, StackItem>();
  for (const item of fromList) {
    fromMap.set(normalizeText(item.name), item);
  }

  const toMap = new Map<string, StackItem>();
  for (const item of toList) {
    toMap.set(normalizeText(item.name), item);
  }

  for (const toItem of toList) {
    const norm = normalizeText(toItem.name);
    const fromItem = fromMap.get(norm);
    if (!fromItem) {
      added.push(toItem);
    } else {
      const fieldDiffs: FieldChange[] = [];
      if (fromItem.name !== toItem.name) {
        fieldDiffs.push({ field: 'name', before: fromItem.name, after: toItem.name });
      }
      if ((fromItem.role || '') !== (toItem.role || '')) {
        fieldDiffs.push({ field: 'role', before: fromItem.role || '', after: toItem.role || '' });
      }
      if ((fromItem.version || '') !== (toItem.version || '')) {
        fieldDiffs.push({ field: 'version', before: fromItem.version || '', after: toItem.version || '' });
      }
      if ((fromItem.notes || '') !== (toItem.notes || '')) {
        fieldDiffs.push({ field: 'notes', before: fromItem.notes || '', after: toItem.notes || '' });
      }

      if (fieldDiffs.length > 0) {
        changed.push({
          id: norm,
          label: toItem.name,
          before: fromItem,
          after: toItem,
          changedFields: fieldDiffs,
        });
      }
    }
  }

  for (const fromItem of fromList) {
    const norm = normalizeText(fromItem.name);
    if (!toMap.has(norm)) {
      removed.push(fromItem);
    }
  }

  // Check reorder: same items present, but order differs
  let reordered = false;
  if (added.length === 0 && removed.length === 0 && fromList.length === toList.length && fromList.length > 1) {
    for (let i = 0; i < fromList.length; i++) {
      if (normalizeText(fromList[i]!.name) !== normalizeText(toList[i]!.name)) {
        reordered = true;
        break;
      }
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0 || reordered;
  return {
    sectionId: 'stack',
    title: 'Stack',
    added,
    removed,
    changed,
    reordered,
    hasChanges,
    summary: formatSectionSummary(added.length, changed.length, removed.length, reordered),
  };
}

/**
 * Compares two lists of items keyed by unique `id`.
 *
 * Duplicate ID Handling:
 * If either list contains multiple items with the identical `id` (e.g. from malformed imports),
 * the diff engine matches the first occurrence in each list (`fromMap` / `toMap`) and ignores
 * subsequent duplicate IDs (`seenToIds` / `seenFromIds`). This ensures:
 * 1. Each unique ID appears at most once across `added`, `removed`, and `changed`.
 * 2. Symmetry invariant holds: `diff(A, B).added` matches `diff(B, A).removed`,
 *    and `diff(A, B).removed` matches `diff(B, A).added`.
 */
function diffIdList<T extends { id: string }>(
  sectionId: DiffSectionId,
  title: string,
  fromList: T[],
  toList: T[],
  getLabel: (item: T) => string,
  compareKeys: Array<keyof T>
): SectionDiff<T> {
  const added: T[] = [];
  const removed: T[] = [];
  const changed: ItemChange<T>[] = [];

  const fromMap = new Map<string, T>();
  for (const item of fromList) {
    if (!fromMap.has(item.id)) fromMap.set(item.id, item);
  }

  const toMap = new Map<string, T>();
  for (const item of toList) {
    if (!toMap.has(item.id)) toMap.set(item.id, item);
  }

  const seenToIds = new Set<string>();
  for (const toItem of toList) {
    if (seenToIds.has(toItem.id)) continue;
    seenToIds.add(toItem.id);

    const fromItem = fromMap.get(toItem.id);
    if (!fromItem) {
      added.push(toItem);
    } else {
      const fieldDiffs: FieldChange[] = [];
      for (const key of compareKeys) {
        const valFrom = fromItem[key];
        const valTo = toItem[key];
        if (typeof valFrom === 'string' && typeof valTo === 'string') {
          if (valFrom.trim() !== valTo.trim()) {
            fieldDiffs.push({ field: String(key), before: valFrom, after: valTo });
          }
        } else if (valFrom !== valTo) {
          fieldDiffs.push({ field: String(key), before: valFrom, after: valTo });
        }
      }

      if (fieldDiffs.length > 0) {
        changed.push({
          id: toItem.id,
          label: getLabel(toItem),
          before: fromItem,
          after: toItem,
          changedFields: fieldDiffs,
        });
      }
    }
  }

  const seenFromIds = new Set<string>();
  for (const fromItem of fromList) {
    if (seenFromIds.has(fromItem.id)) continue;
    seenFromIds.add(fromItem.id);

    if (!toMap.has(fromItem.id)) {
      removed.push(fromItem);
    }
  }

  let reordered = false;
  if (added.length === 0 && removed.length === 0 && fromList.length === toList.length && fromList.length > 1) {
    for (let i = 0; i < fromList.length; i++) {
      if (fromList[i]!.id !== toList[i]!.id) {
        reordered = true;
        break;
      }
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0 || reordered;
  return {
    sectionId,
    title,
    added,
    removed,
    changed,
    reordered,
    hasChanges,
    summary: formatSectionSummary(added.length, changed.length, removed.length, reordered),
  };
}

function diffBugs(fromPassport: PassportV1, toPassport: PassportV1): SectionDiff<Bug> {
  const baseDiff = diffIdList<Bug>(
    'bugs',
    'Bugs',
    fromPassport.bugs || [],
    toPassport.bugs || [],
    (bug) => bug.text,
    ['text', 'severity', 'status']
  );

  const fromReviewed = Boolean(fromPassport.bugsReviewed);
  const toReviewed = Boolean(toPassport.bugsReviewed);

  if (fromReviewed !== toReviewed) {
    baseDiff.changed.push({
      id: 'bugsReviewed',
      label: 'Bugs review status',
      before: { id: 'bugsReviewed', text: `bugsReviewed: ${fromReviewed}`, severity: 'low', status: 'open' },
      after: { id: 'bugsReviewed', text: `bugsReviewed: ${toReviewed}`, severity: 'low', status: 'open' },
      changedFields: [{ field: 'bugsReviewed', before: fromReviewed, after: toReviewed }],
    });
    baseDiff.hasChanges = true;
    baseDiff.summary = formatSectionSummary(baseDiff.added.length, baseDiff.changed.length, baseDiff.removed.length, baseDiff.reordered);
  }

  return baseDiff;
}

function diffStringList(
  sectionId: DiffSectionId,
  title: string,
  fromList: string[],
  toList: string[]
): SectionDiff<string> {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: ItemChange<string>[] = [];

  const fromNormMap = new Map<string, string>();
  for (const s of fromList) {
    fromNormMap.set(normalizeText(s), s);
  }

  const toNormMap = new Map<string, string>();
  for (const s of toList) {
    toNormMap.set(normalizeText(s), s);
  }

  for (const toItem of toList) {
    const norm = normalizeText(toItem);
    if (!fromNormMap.has(norm)) {
      added.push(toItem);
    }
  }

  for (const fromItem of fromList) {
    const norm = normalizeText(fromItem);
    if (!toNormMap.has(norm)) {
      removed.push(fromItem);
    }
  }

  let reordered = false;
  if (added.length === 0 && removed.length === 0 && fromList.length === toList.length && fromList.length > 1) {
    for (let i = 0; i < fromList.length; i++) {
      if (normalizeText(fromList[i]!) !== normalizeText(toList[i]!)) {
        reordered = true;
        break;
      }
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0 || reordered;
  return {
    sectionId,
    title,
    added,
    removed,
    changed,
    reordered,
    hasChanges,
    summary: formatSectionSummary(added.length, changed.length, removed.length, reordered),
  };
}

function diffNextAction(fromAction: string, toAction: string): SectionDiff<NextActionItem> {
  const added: NextActionItem[] = [];
  const removed: NextActionItem[] = [];
  const changed: ItemChange<NextActionItem>[] = [];

  const valFrom = fromAction.trim();
  const valTo = toAction.trim();

  if (!valFrom && valTo) {
    added.push({ id: 'nextAction', value: valTo });
  } else if (valFrom && !valTo) {
    removed.push({ id: 'nextAction', value: valFrom });
  } else if (valFrom && valTo && valFrom !== valTo) {
    changed.push({
      id: 'nextAction',
      label: 'Next action',
      before: { id: 'nextAction', value: valFrom },
      after: { id: 'nextAction', value: valTo },
      changedFields: [{ field: 'nextAction', before: valFrom, after: valTo }],
    });
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0;
  return {
    sectionId: 'nextAction',
    title: 'Next Action',
    added,
    removed,
    changed,
    hasChanges,
    summary: formatSectionSummary(added.length, changed.length, removed.length),
  };
}

function diffFiles(from: ResolvedSource, to: ResolvedSource): SectionDiff<FileItem> {
  if (from.isFilesLegacy || to.isFilesLegacy || from.files === undefined || to.files === undefined) {
    return {
      sectionId: 'files',
      title: 'Files',
      added: [],
      removed: [],
      changed: [],
      notRecorded: true,
      hasChanges: false,
      summary: 'Not recorded (this checkpoint was made before this was tracked)',
    };
  }

  const added: FileItem[] = [];
  const removed: FileItem[] = [];
  const changed: ItemChange<FileItem>[] = [];

  const fromMap = new Map<string, FileItem>();
  for (const f of from.files) {
    fromMap.set(f.path, f);
  }

  const toMap = new Map<string, FileItem>();
  for (const f of to.files) {
    toMap.set(f.path, f);
  }

  for (const toFile of to.files) {
    const fromFile = fromMap.get(toFile.path);
    if (!fromFile) {
      added.push(toFile);
    } else {
      const fieldDiffs: FieldChange[] = [];
      let contentChanged = false;

      if (fromFile.purpose !== toFile.purpose) {
        fieldDiffs.push({ field: 'purpose', before: fromFile.purpose, after: toFile.purpose });
      }
      if (fromFile.included !== toFile.included) {
        fieldDiffs.push({ field: 'included', before: fromFile.included, after: toFile.included });
      }
      if (fromFile.sizeBytes !== toFile.sizeBytes) {
        fieldDiffs.push({ field: 'sizeBytes', before: fromFile.sizeBytes, after: toFile.sizeBytes });
      }

      const shaFrom = 'sha256' in fromFile ? fromFile.sha256 : undefined;
      const shaTo = 'sha256' in toFile ? toFile.sha256 : undefined;
      if (shaFrom !== undefined && shaTo !== undefined && shaFrom !== shaTo) {
        fieldDiffs.push({ field: 'sha256', before: shaFrom, after: shaTo });
        contentChanged = true;
      }

      if (fieldDiffs.length > 0) {
        changed.push({
          id: toFile.path,
          label: toFile.path,
          before: fromFile,
          after: toFile,
          changedFields: fieldDiffs,
          contentChanged,
        });
      }
    }
  }

  for (const fromFile of from.files) {
    if (!toMap.has(fromFile.path)) {
      removed.push(fromFile);
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0;
  return {
    sectionId: 'files',
    title: 'Files',
    added,
    removed,
    changed,
    hasChanges,
    summary: formatSectionSummary(added.length, changed.length, removed.length),
  };
}

function diffConversations(from: ResolvedSource, to: ResolvedSource): SectionDiff<ConversationItem> {
  if (from.isConversationsLegacy || to.isConversationsLegacy) {
    return {
      sectionId: 'conversations',
      title: 'Conversations',
      added: [],
      removed: [],
      changed: [],
      notRecorded: true,
      hasChanges: false,
      summary: 'Not recorded (this checkpoint was made before this was tracked)',
    };
  }

  // If conversationIds is available on both sides, compare included IDs
  const fromIds = from.conversationIds ?? (from.conversations ? from.conversations.filter((c) => c.included).map((c) => c.id) : undefined);
  const toIds = to.conversationIds ?? (to.conversations ? to.conversations.filter((c) => c.included).map((c) => c.id) : undefined);

  if (fromIds === undefined || toIds === undefined) {
    return {
      sectionId: 'conversations',
      title: 'Conversations',
      added: [],
      removed: [],
      changed: [],
      notRecorded: true,
      hasChanges: false,
      summary: 'Not recorded (this checkpoint was made before this was tracked)',
    };
  }

  const fromConvMap = new Map<string, ConversationRef>();
  if (from.conversations) {
    for (const c of from.conversations) fromConvMap.set(c.id, c);
  }

  const toConvMap = new Map<string, ConversationRef>();
  if (to.conversations) {
    for (const c of to.conversations) toConvMap.set(c.id, c);
  }

  const added: ConversationItem[] = [];
  const removed: ConversationItem[] = [];
  const changed: ItemChange<ConversationItem>[] = [];

  const fromIdSet = new Set(fromIds);
  const toIdSet = new Set(toIds);

  for (const id of toIds) {
    if (!fromIdSet.has(id)) {
      const conv = toConvMap.get(id);
      added.push({
        id,
        title: conv ? conv.title : `Conversation ${id}`,
        source: conv?.source,
        messageCount: conv?.messageCount,
        tokenEstimate: conv?.tokenEstimate,
        included: true,
      });
    } else {
      // Check if conversation details changed
      const convFrom = fromConvMap.get(id);
      const convTo = toConvMap.get(id);
      if (convFrom && convTo) {
        const fieldDiffs: FieldChange[] = [];
        if (convFrom.title !== convTo.title) {
          fieldDiffs.push({ field: 'title', before: convFrom.title, after: convTo.title });
        }
        if (convFrom.messageCount !== convTo.messageCount) {
          fieldDiffs.push({ field: 'messageCount', before: convFrom.messageCount, after: convTo.messageCount });
        }
        if (convFrom.tokenEstimate !== convTo.tokenEstimate) {
          fieldDiffs.push({ field: 'tokenEstimate', before: convFrom.tokenEstimate, after: convTo.tokenEstimate });
        }

        if (fieldDiffs.length > 0) {
          changed.push({
            id,
            label: convTo.title,
            before: {
              id,
              title: convFrom.title,
              source: convFrom.source,
              messageCount: convFrom.messageCount,
              tokenEstimate: convFrom.tokenEstimate,
              included: true,
            },
            after: {
              id,
              title: convTo.title,
              source: convTo.source,
              messageCount: convTo.messageCount,
              tokenEstimate: convTo.tokenEstimate,
              included: true,
            },
            changedFields: fieldDiffs,
          });
        }
      }
    }
  }

  for (const id of fromIds) {
    if (!toIdSet.has(id)) {
      const conv = fromConvMap.get(id);
      removed.push({
        id,
        title: conv ? conv.title : `Conversation ${id}`,
        source: conv?.source,
        messageCount: conv?.messageCount,
        tokenEstimate: conv?.tokenEstimate,
        included: true,
      });
    }
  }

  const hasChanges = added.length > 0 || removed.length > 0 || changed.length > 0;
  return {
    sectionId: 'conversations',
    title: 'Conversations',
    added,
    removed,
    changed,
    hasChanges,
    summary: formatSectionSummary(added.length, changed.length, removed.length),
  };
}
