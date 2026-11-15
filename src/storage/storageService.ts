import {
  db,
  type ProjectRecord,
  type PassportRecord,
  type ConversationRecord,
  type FileRecord,
  type CheckpointRecord,
} from './db';
import {
  StorageUnavailable,
  ValidationFailed,
  QuotaExceeded,
  BackupInvalid,
  ProjectNotFound,
  StaleWrite,
  ConversationNotFound,
} from './errors';
import {
  createEmptyPassport,
  validatePassport,
  migratePassport,
  newId,
  applyEditorFields,
  sha256Hex,
  type PassportV1,
  type ConversationTurn,
  type ConversationRef,
  type ConversationSource,
  type CheckpointFileItem,
  conversationTokenEstimate,
  isHardBlocked,
} from '../domain';
import {
  uint8ArrayToBase64,
  base64ToUint8Array,
  formatBytes,
} from '../lib';
import { getTestingStorageOverride } from './testing';

export async function isAvailable(): Promise<boolean> {
  const override = getTestingStorageOverride();
  if (override !== null) {
    return override;
  }
  try {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      return false;
    }
    await db.open();
    return true;
  } catch {
    return false;
  }
}

async function ensureAvailable(): Promise<void> {
  if (!(await isAvailable())) {
    throw new StorageUnavailable();
  }
}

function mapStorageError(err: unknown): never {
  if (
    err instanceof StorageUnavailable ||
    err instanceof ValidationFailed ||
    err instanceof QuotaExceeded ||
    err instanceof BackupInvalid ||
    err instanceof ProjectNotFound ||
    err instanceof StaleWrite
  ) {
    throw err;
  }

  const errObj = err as { name?: string; message?: string; inner?: { name?: string } } | null;
  const name = errObj?.name || errObj?.inner?.name || '';
  const message = errObj?.message || '';

  if (
    name === 'QuotaExceededError' ||
    message.toLowerCase().includes('quota')
  ) {
    throw new QuotaExceeded();
  }

  if (
    name === 'DatabaseClosedError' ||
    name === 'InvalidStateError' ||
    name === 'SecurityError' ||
    message.toLowerCase().includes('blocked')
  ) {
    throw new StorageUnavailable();
  }

  throw err;
}

// ----------------------------------------------------------------------------
// Project CRUD Operations
// ----------------------------------------------------------------------------

export async function createProject(name = 'Untitled Project'): Promise<ProjectRecord> {
  await ensureAvailable();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationFailed(
      'Project name cannot be empty',
      ['Project name cannot be empty'],
      'Please enter a non-empty name for the project.'
    );
  }
  try {
    const passport = createEmptyPassport(trimmed);
    const project: ProjectRecord = {
      id: passport.project.id,
      name: passport.project.name,
      updatedAt: passport.project.updatedAt,
      status: passport.project.status,
    };

    await db.transaction('rw', [db.projects, db.passports], async () => {
      await db.projects.add(project);
      await db.passports.add({ projectId: project.id, passport });
    });

    return project;
  } catch (err) {
    mapStorageError(err);
  }
}

export async function listProjects(): Promise<ProjectRecord[]> {
  await ensureAvailable();
  try {
    return await db.projects.orderBy('updatedAt').reverse().toArray();
  } catch (err) {
    mapStorageError(err);
  }
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  await ensureAvailable();
  try {
    const project = await db.projects.get(id);
    return project ?? null;
  } catch (err) {
    mapStorageError(err);
  }
}

export async function renameProject(id: string, newName: string): Promise<void> {
  await ensureAvailable();
  const trimmed = newName.trim();
  if (!trimmed) {
    throw new ValidationFailed(
      'Project name cannot be empty',
      ['Project name cannot be empty'],
      'Please enter a non-empty name for the project.'
    );
  }
  try {
    await db.transaction('rw', [db.projects, db.passports], async () => {
      const project = await db.projects.get(id);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${id}" was not found. It may have been deleted.`,
          'Go back to your projects and try again.'
        );
      }
      const passportRecord = await db.passports.get(id);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Project "${id}" was not found. It may have been deleted.`,
          'Go back to your projects and try again.'
        );
      }

      const now = new Date().toISOString();
      project.name = trimmed;
      project.updatedAt = now;
      passportRecord.passport.project.name = trimmed;
      passportRecord.passport.project.updatedAt = now;

      await db.projects.put(project);
      await db.passports.put(passportRecord);
    });
  } catch (err) {
    mapStorageError(err);
  }
}

export async function deleteProject(id: string): Promise<void> {
  await ensureAvailable();
  try {
    await db.transaction(
      'rw',
      [db.projects, db.passports, db.checkpoints, db.conversations, db.files],
      async () => {
        await db.projects.delete(id);
        await db.passports.delete(id);
        await db.checkpoints.where('projectId').equals(id).delete();
        await db.conversations.where('projectId').equals(id).delete();
        await db.files.where('projectId').equals(id).delete();
      }
    );
  } catch (err) {
    mapStorageError(err);
  }
}

// ----------------------------------------------------------------------------
// Passport Operations
// ----------------------------------------------------------------------------

export async function getPassport(projectId: string): Promise<PassportV1 | null> {
  await ensureAvailable();
  try {
    const record: PassportRecord | undefined = await db.passports.get(projectId);
    if (!record) {
      return null;
    }
    const migration = migratePassport(record.passport);
    if (!migration.success || !migration.passport) {
      throw new ValidationFailed(
        'Stored passport data failed validation during migration.',
        migration.errors
      );
    }
    return migration.passport;
  } catch (err) {
    mapStorageError(err);
  }
}

export interface SavePassportOptions {
  expectedUpdatedAt?: string;
}

export async function savePassport(
  passport: PassportV1,
  options?: SavePassportOptions
): Promise<void> {
  await ensureAvailable();
  const validation = validatePassport(passport);
  if (!validation.success || !validation.data) {
    throw new ValidationFailed(
      'Cannot save invalid passport data.',
      validation.errors
    );
  }

  const validPassport = validation.data;
  const now = new Date().toISOString();
  passport.project.updatedAt = now;
  validPassport.project.updatedAt = now;

  try {
    await db.transaction('rw', [db.projects, db.passports], async () => {
      const existingProject = await db.projects.get(validPassport.project.id);
      if (!existingProject) {
        throw new ProjectNotFound(
          `Project "${validPassport.project.id}" was not found. It may have been deleted.`,
          'Go back to your projects and try again.'
        );
      }

      // Stale-write check: if expectedUpdatedAt was supplied, ensure project wasn't modified concurrently
      if (options?.expectedUpdatedAt && existingProject.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      existingProject.name = validPassport.project.name;
      existingProject.status = validPassport.project.status;
      existingProject.updatedAt = now;
      await db.projects.put(existingProject);

      await db.passports.put({
        projectId: validPassport.project.id,
        passport: validPassport,
      });
    });
  } catch (err) {
    mapStorageError(err);
  }
}

export interface ApplyMergeOptions {
  projectId: string;
  expectedUpdatedAt?: string;
  mergedPassport: PassportV1;
  checkpointDescription?: string;
}

export interface ApplyMergeResult {
  checkpointId: string;
  updatedPassport: PassportV1;
}

export async function applyMergeWithCheckpoint({
  projectId,
  expectedUpdatedAt,
  mergedPassport,
  checkpointDescription = 'Before merge',
}: ApplyMergeOptions): Promise<ApplyMergeResult> {
  await ensureAvailable();

  const validation = validatePassport(mergedPassport);
  if (!validation.success || !validation.data) {
    throw new ValidationFailed(
      'Cannot save invalid passport data.',
      validation.errors
    );
  }

  const validPassport = validation.data;
  const now = new Date().toISOString();
  validPassport.project.id = projectId;
  validPassport.project.updatedAt = now;

  let checkpointId = '';

  try {
    await db.transaction('rw', [db.projects, db.passports, db.checkpoints], async () => {
      const existingProject = await db.projects.get(projectId);
      if (!existingProject) {
        throw new ProjectNotFound(
          `Project "${projectId}" was not found. It may have been deleted.`,
          'Go back to your projects and try again.'
        );
      }

      // Stale-write check: if expectedUpdatedAt was supplied, ensure project wasn't modified concurrently
      if (expectedUpdatedAt && existingProject.updatedAt !== expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const existingPassportRecord = await db.passports.get(projectId);
      if (!existingPassportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      // Save automatic pre-merge backup checkpoint
      checkpointId = newId();
      const checkpoint: CheckpointRecord = {
        id: checkpointId,
        projectId,
        createdAt: now,
        type: 'before_merge',
        description: checkpointDescription,
        passport: JSON.parse(JSON.stringify(existingPassportRecord.passport)),
      };
      await db.checkpoints.put(checkpoint);

      // Save updated merged passport and project
      existingProject.name = validPassport.project.name;
      existingProject.status = validPassport.project.status;
      existingProject.updatedAt = now;
      await db.projects.put(existingProject);

      await db.passports.put({
        projectId,
        passport: validPassport,
      });
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return {
      checkpointId,
      updatedPassport: validPassport,
    };
  } catch (err) {
    mapStorageError(err);
  }
}

export interface CreateCheckpointOptions {
  note?: string;
  expectedUpdatedAt?: string;
}

/**
 * Retrieves the current project files from the database with calculated SHA-256 hashes.
 * Follows the same hashing logic as checkpoint creation (excluded files have sha256: null).
 */
export async function getCurrentFileHashes(projectId: string): Promise<CheckpointFileItem[]> {
  const passport = await getPassport(projectId);
  if (!passport || !passport.files || passport.files.length === 0) {
    return [];
  }

  const rawFiles = await db.files.where('projectId').equals(projectId).toArray();
  const fileMap = new Map<string, FileRecord>();
  for (const f of rawFiles) {
    fileMap.set(f.path, f);
  }

  const checkpointFiles: CheckpointFileItem[] = [];
  for (const f of passport.files) {
    let sha256: string | null = null;
    if (f.included) {
      const rec = fileMap.get(f.path);
      if (rec) {
        try {
          sha256 = await sha256Hex(rec.content);
        } catch {
          sha256 = null;
        }
      }
    }
    checkpointFiles.push({
      path: f.path,
      purpose: f.purpose,
      included: f.included,
      sizeBytes: f.sizeBytes,
      sha256,
    });
  }

  return checkpointFiles;
}

/**
 * Creates a named snapshot of the project passport with file SHA-256 hashes and conversation IDs.
 *
 * Invariants:
 * - Computes file hashes OUTSIDE the Dexie transaction (SubtleCrypto non-blocking, never inside Dexie tx).
 * - Excluded files receive sha256: null.
 * - Writes project, passport, and checkpoint atomically inside one transaction.
 * - If the project updatedAt changed during the hashing window, retries once before throwing StaleWrite.
 * - Dispatches 'project-storage-updated'.
 */
export async function createCheckpoint(
  projectId: string,
  options?: CreateCheckpointOptions
): Promise<string> {
  await ensureAvailable();

  const doSnapshot = async (isRetry = false): Promise<string> => {
    const project = await db.projects.get(projectId);
    if (!project) {
      throw new ProjectNotFound(
        `Project "${projectId}" was not found. It may have been deleted.`,
        'Go back to your projects and try again.'
      );
    }

    if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
      throw new StaleWrite();
    }

    const passportRecord = await db.passports.get(projectId);
    if (!passportRecord) {
      throw new ProjectNotFound(
        `Passport for project "${projectId}" was not found.`,
        'Go back to your projects and try again.'
      );
    }

    const passport = passportRecord.passport;
    const includedConvIds = passport.conversations
      ? passport.conversations.filter((c) => c.included).map((c) => c.id)
      : [];

    const rawFiles = await db.files.where('projectId').equals(projectId).toArray();
    const fileMap = new Map<string, FileRecord>();
    for (const f of rawFiles) {
      fileMap.set(f.path, f);
    }

    // Compute hashes outside the transaction
    const checkpointFiles: CheckpointFileItem[] = [];
    if (passport.files) {
      for (const f of passport.files) {
        let sha256: string | null = null;
        if (f.included) {
          const rec = fileMap.get(f.path);
          if (rec) {
            try {
              sha256 = await sha256Hex(rec.content);
            } catch {
              sha256 = null;
            }
          }
        }
        checkpointFiles.push({
          path: f.path,
          purpose: f.purpose,
          included: f.included,
          sizeBytes: f.sizeBytes,
          sha256,
        });
      }
    }

    let checkpointId = '';
    const now = new Date().toISOString();

    try {
      await db.transaction('rw', [db.projects, db.passports, db.checkpoints], async () => {
        const currentProj = await db.projects.get(projectId);
        if (!currentProj) {
          throw new ProjectNotFound(
            `Project "${projectId}" was not found.`,
            'Go back to your projects and try again.'
          );
        }

        const baselineUpdatedAt = options?.expectedUpdatedAt || project.updatedAt;
        if (currentProj.updatedAt !== baselineUpdatedAt) {
          throw new StaleWrite();
        }

        checkpointId = newId();
        const note = options?.note?.trim() || undefined;
        const checkpoint: CheckpointRecord = {
          id: checkpointId,
          projectId,
          createdAt: now,
          type: 'manual',
          note,
          description: note || 'Manual checkpoint',
          passport: JSON.parse(JSON.stringify(passport)),
          conversationIds: includedConvIds,
          files: checkpointFiles,
        };

        await db.checkpoints.put(checkpoint);
      });
    } catch (err) {
      if (err instanceof StaleWrite && !isRetry && !options?.expectedUpdatedAt) {
        // Retry once if concurrent edit occurred during external hash computation
        return doSnapshot(true);
      }
      throw err;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return checkpointId;
  };

  try {
    return await doSnapshot();
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Lists all checkpoints for a project, sorted newest first.
 */
export async function listCheckpoints(projectId: string): Promise<CheckpointRecord[]> {
  await ensureAvailable();
  try {
    const list = await db.checkpoints.where('projectId').equals(projectId).toArray();
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Restores a checkpoint onto the project passport.
 *
 * Invariants (SPEC §10 & Slice 9 Restore Decision):
 * - Restores editor-owned fields ONLY (via applyEditorFields), preserving all current files and conversations.
 * - Always creates an automated "Before restore" checkpoint first in the SAME transaction.
 * - Checks stale-write guard if expectedUpdatedAt is provided.
 * - Fully rolls back if any write in the transaction fails.
 * - Dispatches 'project-storage-updated'.
 */
export async function restoreCheckpoint(
  checkpointId: string,
  options?: { expectedUpdatedAt?: string }
): Promise<PassportV1> {
  await ensureAvailable();

  try {
    let restoredPassport: PassportV1 | null = null;

    // 1. Fetch checkpoint
    const checkpoint = await db.checkpoints.get(checkpointId);
    if (!checkpoint || !checkpoint.passport) {
      throw new ProjectNotFound(
        `Checkpoint "${checkpointId}" not found or contains no passport data.`,
        'Refresh your checkpoints timeline and try again.'
      );
    }

    const projectId = checkpoint.projectId;
    const currentProject = await db.projects.get(projectId);
    if (!currentProject) {
      throw new ProjectNotFound(
        `Project "${projectId}" was not found.`,
        'Go back to your projects and try again.'
      );
    }

    if (options?.expectedUpdatedAt && currentProject.updatedAt !== options.expectedUpdatedAt) {
      throw new StaleWrite();
    }

    const currentPassportRecord = await db.passports.get(projectId);
    if (!currentPassportRecord) {
      throw new ProjectNotFound(
        `Passport for project "${projectId}" was not found.`,
        'Go back to your projects and try again.'
      );
    }

    // 2. Pre-compute hashes and snapshot info OUTSIDE transaction for the "Before restore" checkpoint
    const currentPassport = currentPassportRecord.passport;
    const currentIncludedConvIds = currentPassport.conversations
      ? currentPassport.conversations.filter((c) => c.included).map((c) => c.id)
      : [];

    const rawFiles = await db.files.where('projectId').equals(projectId).toArray();
    const fileMap = new Map<string, FileRecord>();
    for (const f of rawFiles) {
      fileMap.set(f.path, f);
    }

    const currentCheckpointFiles: CheckpointFileItem[] = [];
    if (currentPassport.files) {
      for (const f of currentPassport.files) {
        let sha256: string | null = null;
        if (f.included) {
          const rec = fileMap.get(f.path);
          if (rec) {
            try {
              sha256 = await sha256Hex(rec.content);
            } catch {
              sha256 = null;
            }
          }
        }
        currentCheckpointFiles.push({
          path: f.path,
          purpose: f.purpose,
          included: f.included,
          sizeBytes: f.sizeBytes,
          sha256,
        });
      }
    }

    // 3. Atomically write "Before restore" checkpoint and restored editor fields
    await db.transaction('rw', [db.projects, db.passports, db.checkpoints], async () => {
      const proj = await db.projects.get(projectId);
      if (!proj) {
        throw new ProjectNotFound(
          `Project "${projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && proj.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const pRecord = await db.passports.get(projectId);
      if (!pRecord) {
        throw new ProjectNotFound(
          `Passport for project "${projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      const now = new Date().toISOString();

      // SPEC §10: Restoring a checkpoint ALWAYS creates an automated "Before restore" checkpoint first.
      await db.checkpoints.put({
        id: newId(),
        projectId,
        createdAt: now,
        type: 'before_restore',
        description: 'Before restore',
        passport: JSON.parse(JSON.stringify(pRecord.passport)),
        conversationIds: currentIncludedConvIds,
        files: currentCheckpointFiles,
      });

      // Restore editor-owned fields ONLY, preserving current files and conversations
      restoredPassport = applyEditorFields(pRecord.passport, checkpoint.passport!);
      restoredPassport.project.updatedAt = now;

      proj.name = restoredPassport.project.name;
      proj.status = restoredPassport.project.status;
      proj.updatedAt = now;

      await db.projects.put(proj);
      await db.passports.put({
        projectId,
        passport: restoredPassport,
      });
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return restoredPassport!;
  } catch (err) {
    mapStorageError(err);
  }
}

export async function getCheckpoint(checkpointId: string): Promise<CheckpointRecord | null> {
  await ensureAvailable();
  try {
    const cp = await db.checkpoints.get(checkpointId);
    return cp || null;
  } catch (err) {
    mapStorageError(err);
  }
}

// ----------------------------------------------------------------------------
// Conversation Operations
// ----------------------------------------------------------------------------

export interface AddPastedConversationInput {
  title: string;
  source: ConversationSource;
  turns: ConversationTurn[];
  included?: boolean;
}

export interface AddImportedConversationItem {
  id?: string;
  title: string;
  source: 'chatgpt' | 'claude';
  createdAt?: string;
  turns: ConversationTurn[];
  included?: boolean;
}

export interface AddImportedConversationsOptions {
  expectedUpdatedAt?: string;
  skipExisting?: boolean;
}

export interface AddImportedConversationsResult {
  importedIds: string[];
  skippedCount: number;
}

export interface RemoveConversationResult {
  conversation: ConversationRecord;
  ref: ConversationRef;
}

/**
 * Converts a stored ConversationRecord into pure ConversationTurn domain models.
 */
export function recordToTurns(record: ConversationRecord): ConversationTurn[] {
  return record.messages.map((m, idx) => ({
    id: m.id || `turn-${idx}`,
    role: m.role === 'assistant' ? 'assistant' : 'user',
    text: m.text,
  }));
}

export async function addConversation(conversation: ConversationRecord): Promise<string> {
  await ensureAvailable();
  try {
    await db.conversations.put(conversation);
    return conversation.id;
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Adds a pasted conversation, atomically persisting the ConversationRecord,
 * linking the ConversationRef in passport.conversations, and bumping project.updatedAt.
 * Protected by the atomic stale-write guard.
 */
export async function addPastedConversation(
  projectId: string,
  input: AddPastedConversationInput,
  options?: { expectedUpdatedAt?: string }
): Promise<string> {
  await ensureAvailable();
  let conversationId = '';

  try {
    await db.transaction('rw', [db.projects, db.passports, db.conversations], async () => {
      const project = await db.projects.get(projectId);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${projectId}" was not found. It may have been deleted.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(projectId);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      conversationId = newId();
      const now = new Date().toISOString();

      const convRecord: ConversationRecord = {
        id: conversationId,
        projectId,
        title: input.title.trim() || 'Untitled conversation',
        source: input.source,
        messages: input.turns.map((t) => ({
          id: t.id,
          role: t.role,
          text: t.text,
        })),
        createdAt: now,
      };
      await db.conversations.put(convRecord);

      const tokenEstimate = conversationTokenEstimate(input.turns);
      const ref: ConversationRef = {
        id: conversationId,
        title: convRecord.title,
        source: input.source,
        messageCount: input.turns.length,
        tokenEstimate,
        included: input.included ?? true,
      };

      const passport = passportRecord.passport;
      passport.conversations = [...(passport.conversations || []), ref];
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.passports.put({ projectId, passport });
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return conversationId;
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Atomically stores selected imported conversations and links their references in passport.conversations.
 *
 * Invariants:
 * - Full transactional atomicity: all selected conversations land or none do.
 * - Enforces the 5c optimistic concurrency stale-write guard.
 * - Detects already-attached conversations and skips duplicates without failure when requested.
 * - Dispatches 'project-storage-updated' event upon commit.
 */
export async function addImportedConversations(
  projectId: string,
  items: AddImportedConversationItem[],
  options?: AddImportedConversationsOptions
): Promise<AddImportedConversationsResult> {
  await ensureAvailable();
  const importedIds: string[] = [];
  let skippedCount = 0;

  try {
    await db.transaction('rw', [db.projects, db.passports, db.conversations], async () => {
      const project = await db.projects.get(projectId);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${projectId}" was not found. It may have been deleted.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(projectId);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      const passport = passportRecord.passport;
      const existingRefs = passport.conversations || [];
      const existingIds = new Set(existingRefs.map((c) => c.id));
      const newRefs: ConversationRef[] = [];
      const now = new Date().toISOString();

      for (const item of items) {
        const candidateId = item.id
          ? item.id.includes(projectId)
            ? item.id
            : `${projectId}:${item.id}`
          : newId();

        const isDuplicate =
          existingIds.has(candidateId) || (item.id !== undefined && existingIds.has(item.id));

        if (isDuplicate) {
          if (options?.skipExisting !== false) {
            skippedCount++;
            continue;
          }
        }

        const convId = candidateId;
        const convRecord: ConversationRecord = {
          id: convId,
          projectId,
          title: item.title.trim() || 'Untitled conversation',
          source: item.source,
          messages: item.turns.map((t) => ({
            id: t.id,
            role: t.role,
            text: t.text,
          })),
          createdAt: item.createdAt || now,
        };

        await db.conversations.put(convRecord);

        const tokenEstimate = conversationTokenEstimate(item.turns);
        const ref: ConversationRef = {
          id: convId,
          title: convRecord.title,
          source: item.source,
          messageCount: item.turns.length,
          tokenEstimate,
          included: item.included ?? true,
        };

        newRefs.push(ref);
        existingIds.add(convId);
        importedIds.push(convId);
      }

      if (importedIds.length > 0) {
        passport.conversations = [...existingRefs, ...newRefs];
        passport.project.updatedAt = now;
        project.updatedAt = now;

        await db.passports.put({ projectId, passport });
        await db.projects.put(project);
      }
    });

    if (importedIds.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return { importedIds, skippedCount };
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Updates the turns of an existing conversation in one atomic transaction,
 * updating message count and token estimate on the linked passport reference.
 */
export async function updateConversationTurns(
  conversationId: string,
  turns: ConversationTurn[],
  options?: { expectedUpdatedAt?: string; title?: string }
): Promise<void> {
  await ensureAvailable();
  try {
    await db.transaction('rw', [db.projects, db.passports, db.conversations], async () => {
      const conv = await db.conversations.get(conversationId);
      if (!conv) {
        throw new ConversationNotFound();
      }

      const project = await db.projects.get(conv.projectId);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${conv.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(conv.projectId);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${conv.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      const now = new Date().toISOString();
      conv.messages = turns.map((t) => ({
        id: t.id,
        role: t.role,
        text: t.text,
      }));
      if (options?.title) {
        conv.title = options.title.trim();
      }
      await db.conversations.put(conv);

      const tokenEstimate = conversationTokenEstimate(turns);
      const passport = passportRecord.passport;
      passport.conversations = passport.conversations.map((ref) => {
        if (ref.id === conversationId) {
          return {
            ...ref,
            title: options?.title ? options.title.trim() : ref.title,
            messageCount: turns.length,
            tokenEstimate,
          };
        }
        return ref;
      });

      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.passports.put({ projectId: conv.projectId, passport });
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Toggles or updates the `included` flag for a conversation reference.
 */
export async function setConversationIncluded(
  conversationId: string,
  included: boolean,
  options?: { expectedUpdatedAt?: string }
): Promise<void> {
  await ensureAvailable();
  try {
    await db.transaction('rw', [db.projects, db.passports, db.conversations], async () => {
      const conv = await db.conversations.get(conversationId);
      if (!conv) {
        throw new ConversationNotFound();
      }

      const project = await db.projects.get(conv.projectId);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${conv.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(conv.projectId);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${conv.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      const passport = passportRecord.passport;
      passport.conversations = passport.conversations.map((ref) =>
        ref.id === conversationId ? { ...ref, included } : ref
      );

      const now = new Date().toISOString();
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.passports.put({ projectId: conv.projectId, passport });
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }
  } catch (err) {
    mapStorageError(err);
  }
}

export async function listConversations(projectId: string): Promise<ConversationRecord[]> {
  await ensureAvailable();
  try {
    return await db.conversations.where('projectId').equals(projectId).sortBy('createdAt');
  } catch (err) {
    mapStorageError(err);
  }
}

export async function getConversation(id: string): Promise<ConversationRecord | null> {
  await ensureAvailable();
  try {
    const conversation = await db.conversations.get(id);
    return conversation ?? null;
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Removes a conversation record and its reference from passport.conversations in one transaction.
 * Returns the removed record and reference to enable full Undo restoration.
 */
export async function removeConversation(
  id: string,
  options?: { expectedUpdatedAt?: string }
): Promise<RemoveConversationResult | null> {
  await ensureAvailable();
  let removedData: RemoveConversationResult | null = null;

  try {
    await db.transaction('rw', [db.projects, db.passports, db.conversations], async () => {
      const conv = await db.conversations.get(id);
      if (!conv) {
        return;
      }

      const project = await db.projects.get(conv.projectId);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${conv.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(conv.projectId);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${conv.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      const passport = passportRecord.passport;
      const ref = passport.conversations.find((r) => r.id === id);

      if (ref) {
        removedData = { conversation: conv, ref: { ...ref } };
        passport.conversations = passport.conversations.filter((r) => r.id !== id);
      }

      const now = new Date().toISOString();
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.conversations.delete(id);
      await db.passports.put({ projectId: conv.projectId, passport });
      await db.projects.put(project);
    });

    if (removedData && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return removedData;
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Restores a previously removed conversation record and reference (e.g. for Toast Undo).
 */
export async function restoreConversation(
  conversation: ConversationRecord,
  ref: ConversationRef,
  options?: { expectedUpdatedAt?: string }
): Promise<void> {
  await ensureAvailable();
  try {
    await db.transaction('rw', [db.projects, db.passports, db.conversations], async () => {
      const project = await db.projects.get(conversation.projectId);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${conversation.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(conversation.projectId);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${conversation.projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      const passport = passportRecord.passport;
      if (!passport.conversations.some((r) => r.id === ref.id)) {
        passport.conversations.push(ref);
      }

      const now = new Date().toISOString();
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.conversations.put(conversation);
      await db.passports.put({ projectId: conversation.projectId, passport });
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }
  } catch (err) {
    mapStorageError(err);
  }
}

// ----------------------------------------------------------------------------
// File Operations
// ----------------------------------------------------------------------------

export async function addFile(file: FileRecord): Promise<string> {
  await ensureAvailable();
  try {
    await db.files.put(file);
    return file.id;
  } catch (err) {
    mapStorageError(err);
  }
}

export async function listFiles(projectId: string): Promise<FileRecord[]> {
  await ensureAvailable();
  try {
    return await db.files.where('projectId').equals(projectId).toArray();
  } catch (err) {
    mapStorageError(err);
  }
}

export async function getFile(id: string): Promise<FileRecord | null> {
  await ensureAvailable();
  try {
    const file = await db.files.get(id);
    return file ?? null;
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Retrieves a file record by project ID and relative path.
 */
export async function getProjectFile(projectId: string, path: string): Promise<FileRecord | null> {
  await ensureAvailable();
  try {
    const fileId = `${projectId}:${path}`;
    const file = await db.files.get(fileId);
    return file ?? null;
  } catch (err) {
    mapStorageError(err);
  }
}

export async function removeFile(id: string): Promise<void> {
  await ensureAvailable();
  try {
    await db.files.delete(id);
  } catch (err) {
    mapStorageError(err);
  }
}

// ----------------------------------------------------------------------------
// Project Files Storage Operations (Slice 8)
// ----------------------------------------------------------------------------

export interface AddProjectFileInput {
  path: string;
  content?: string | Uint8Array;
  sizeBytes: number;
  purpose?: string;
  included?: boolean;
  acknowledgedFindings?: string[];
}

export interface AddProjectFilesResult {
  addedCount: number;
  paths: string[];
}

/**
 * Atomically stores reviewed project files and keeps passport.files in sync.
 *
 * Invariants:
 * - Defense in depth: Rejects any hard-blocked path (.env, keys) at the service layer.
 * - Single atomic transaction on [db.projects, db.passports, db.files].
 * - Full rollback on failure.
 * - Stale-write guard protected.
 * - Excluded files (included: false) store no content in db.files, only manifest entry.
 * - Dispatches 'project-storage-updated'.
 */
export async function addProjectFiles(
  projectId: string,
  items: AddProjectFileInput[],
  options?: { expectedUpdatedAt?: string }
): Promise<AddProjectFilesResult> {
  await ensureAvailable();

  // Defense in depth: reject any hard-blocked paths before touching DB
  for (const item of items) {
    if (isHardBlocked(item.path)) {
      throw new ValidationFailed(
        `File "${item.path}" is hard-blocked for security.`,
        [`File "${item.path}" is hard-blocked for security.`],
        'Hard-blocked files (.env, keys) cannot be stored in Project Passport.'
      );
    }
  }

  const addedPaths: string[] = [];

  try {
    await db.transaction('rw', [db.projects, db.passports, db.files], async () => {
      const project = await db.projects.get(projectId);
      if (!project) {
        throw new ProjectNotFound(
          `Project "${projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(projectId);
      if (!passportRecord) {
        throw new ProjectNotFound(
          `Passport for project "${projectId}" was not found.`,
          'Go back to your projects and try again.'
        );
      }

      const now = new Date().toISOString();
      const passport = passportRecord.passport;
      const currentFiles = [...(passport.files || [])];

      for (const item of items) {
        const fileId = `${projectId}:${item.path}`;

        // If included !== false and content is provided, store in files table
        if (item.included !== false && item.content !== undefined) {
          const fileRecord: FileRecord = {
            id: fileId,
            projectId,
            path: item.path,
            mime: 'text/plain',
            content: item.content,
            sizeBytes: item.sizeBytes,
            acknowledgedFindings: item.acknowledgedFindings ?? [],
          };
          await db.files.put(fileRecord);
        } else {
          // If excluded, delete any prior content from files table
          await db.files.delete(fileId);
        }

        // Update passport.files manifest row
        const existingIdx = currentFiles.findIndex((f) => f.path === item.path);
        const manifestRow = {
          path: item.path,
          purpose: item.purpose ?? (existingIdx >= 0 ? currentFiles[existingIdx]!.purpose : ''),
          included: item.included ?? true,
          sizeBytes: item.sizeBytes,
        };

        if (existingIdx >= 0) {
          currentFiles[existingIdx] = manifestRow;
        } else {
          currentFiles.push(manifestRow);
        }

        addedPaths.push(item.path);
      }

      passport.files = currentFiles;
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.passports.put({ projectId, passport });
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return {
      addedCount: addedPaths.length,
      paths: addedPaths,
    };
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Updates file purpose and included status in passport.files manifest.
 */
export async function updateProjectFileMeta(
  projectId: string,
  path: string,
  updates: { purpose?: string; included?: boolean },
  options?: { expectedUpdatedAt?: string }
): Promise<void> {
  await ensureAvailable();

  try {
    await db.transaction('rw', [db.projects, db.passports, db.files], async () => {
      const project = await db.projects.get(projectId);
      if (!project) throw new ProjectNotFound(`Project "${projectId}" not found.`);

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(projectId);
      if (!passportRecord) throw new ProjectNotFound(`Passport for "${projectId}" not found.`);

      const passport = passportRecord.passport;
      const fileEntry = (passport.files || []).find((f) => f.path === path);
      if (!fileEntry) {
        throw new ValidationFailed(`File "${path}" not found in project manifest.`);
      }

      if (updates.purpose !== undefined) {
        fileEntry.purpose = updates.purpose;
      }
      if (updates.included !== undefined) {
        fileEntry.included = updates.included;
      }

      const now = new Date().toISOString();
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.passports.put({ projectId, passport });
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }
  } catch (err) {
    mapStorageError(err);
  }
}

export interface RemovedFilePayload {
  manifestRow: {
    path: string;
    purpose: string;
    included: boolean;
    sizeBytes: number;
  };
  fileRecord?: FileRecord;
}

/**
 * Removes a file from passport.files manifest and deletes stored content from db.files.
 * Returns payload for undo support.
 */
export async function removeProjectFile(
  projectId: string,
  path: string,
  options?: { expectedUpdatedAt?: string }
): Promise<RemovedFilePayload> {
  await ensureAvailable();
  let payload: RemovedFilePayload | null = null;

  try {
    await db.transaction('rw', [db.projects, db.passports, db.files], async () => {
      const project = await db.projects.get(projectId);
      if (!project) throw new ProjectNotFound(`Project "${projectId}" not found.`);

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(projectId);
      if (!passportRecord) throw new ProjectNotFound(`Passport for "${projectId}" not found.`);

      const passport = passportRecord.passport;
      const currentFiles = passport.files || [];
      const idx = currentFiles.findIndex((f) => f.path === path);
      if (idx === -1) {
        throw new ValidationFailed(`File "${path}" not found in project manifest.`);
      }

      const manifestRow = currentFiles[idx]!;
      currentFiles.splice(idx, 1);

      const fileId = `${projectId}:${path}`;
      const fileRecord = await db.files.get(fileId);
      if (fileRecord) {
        await db.files.delete(fileId);
      }

      const now = new Date().toISOString();
      passport.files = currentFiles;
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.passports.put({ projectId, passport });
      await db.projects.put(project);

      payload = {
        manifestRow,
        fileRecord,
      };
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }

    return payload!;
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Restores a removed file for undo functionality.
 */
export async function restoreProjectFile(
  projectId: string,
  data: RemovedFilePayload,
  options?: { expectedUpdatedAt?: string }
): Promise<void> {
  await ensureAvailable();

  try {
    await db.transaction('rw', [db.projects, db.passports, db.files], async () => {
      const project = await db.projects.get(projectId);
      if (!project) throw new ProjectNotFound(`Project "${projectId}" not found.`);

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const passportRecord = await db.passports.get(projectId);
      if (!passportRecord) throw new ProjectNotFound(`Passport for "${projectId}" not found.`);

      const passport = passportRecord.passport;
      passport.files = [...(passport.files || []), data.manifestRow];

      if (data.fileRecord) {
        await db.files.put(data.fileRecord);
      }

      const now = new Date().toISOString();
      passport.project.updatedAt = now;
      project.updatedAt = now;

      await db.passports.put({ projectId, passport });
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }
  } catch (err) {
    mapStorageError(err);
  }
}

/**
 * Acknowledges a secret finding on a file, saving the findingKey on the FileRecord.
 */
export async function acknowledgeFinding(
  projectId: string,
  path: string,
  findingKeyStr: string,
  options?: { expectedUpdatedAt?: string }
): Promise<void> {
  await ensureAvailable();

  try {
    await db.transaction('rw', [db.projects, db.passports, db.files], async () => {
      const project = await db.projects.get(projectId);
      if (!project) throw new ProjectNotFound(`Project "${projectId}" not found.`);

      if (options?.expectedUpdatedAt && project.updatedAt !== options.expectedUpdatedAt) {
        throw new StaleWrite();
      }

      const fileId = `${projectId}:${path}`;
      const fileRecord = await db.files.get(fileId);
      if (fileRecord) {
        const acks = new Set(fileRecord.acknowledgedFindings ?? []);
        acks.add(findingKeyStr);
        fileRecord.acknowledgedFindings = Array.from(acks);
        await db.files.put(fileRecord);
      }

      const now = new Date().toISOString();
      project.updatedAt = now;
      await db.projects.put(project);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    }
  } catch (err) {
    mapStorageError(err);
  }
}

// ----------------------------------------------------------------------------
// Backup & Restore
// ----------------------------------------------------------------------------

export interface BackupFileRecord {
  id: string;
  projectId: string;
  path: string;
  mime: string;
  content: string;
  isBinary: boolean;
  sizeBytes: number;
  acknowledgedFindings?: string[];
}

export interface BackupProjectItem {
  project: ProjectRecord;
  passport: PassportV1;
  conversations: ConversationRecord[];
  files: BackupFileRecord[];
  checkpoints: CheckpointRecord[];
}

export interface BackupData {
  backupVersion: 1;
  createdAt: string;
  projects: BackupProjectItem[];
}

export interface ImportBackupResult {
  success: boolean;
  projectsImported: number;
  warnSizeExceeded: boolean;
  warning?: string;
}

function serializeFileForBackup(file: FileRecord): BackupFileRecord {
  const isBinary = file.content instanceof Uint8Array || typeof file.content !== 'string';
  const content = isBinary
    ? uint8ArrayToBase64(file.content as Uint8Array)
    : (file.content as string);

  return {
    id: file.id,
    projectId: file.projectId,
    path: file.path,
    mime: file.mime,
    content,
    isBinary,
    sizeBytes: file.sizeBytes,
    acknowledgedFindings: file.acknowledgedFindings ? [...file.acknowledgedFindings] : undefined,
  };
}

function deserializeFileFromBackup(file: BackupFileRecord): FileRecord {
  const content = file.isBinary
    ? base64ToUint8Array(file.content)
    : file.content;

  return {
    id: file.id,
    projectId: file.projectId,
    path: file.path,
    mime: file.mime,
    content,
    sizeBytes: file.sizeBytes,
    acknowledgedFindings: file.acknowledgedFindings ? [...file.acknowledgedFindings] : undefined,
  };
}

export async function exportEverything(): Promise<BackupData> {
  await ensureAvailable();
  try {
    const projects = await db.projects.toArray();
    const backupProjects: BackupProjectItem[] = [];

    for (const project of projects) {
      const passportRecord = await db.passports.get(project.id);
      if (!passportRecord) continue;

      const conversations = await db.conversations
        .where('projectId')
        .equals(project.id)
        .sortBy('createdAt');
      const rawFiles = await db.files.where('projectId').equals(project.id).toArray();
      const checkpoints = await db.checkpoints
        .where('projectId')
        .equals(project.id)
        .toArray();

      const files = rawFiles.map(serializeFileForBackup);

      backupProjects.push({
        project,
        passport: passportRecord.passport,
        conversations,
        files,
        checkpoints,
      });
    }

    return {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: backupProjects,
    };
  } catch (err) {
    mapStorageError(err);
  }
}

export async function importBackup(
  backupInput: BackupData | string
): Promise<ImportBackupResult> {
  await ensureAvailable();

  let byteSize = 0;
  let parsedBackup: unknown;

  if (typeof backupInput === 'string') {
    byteSize = new TextEncoder().encode(backupInput).length;
    try {
      parsedBackup = JSON.parse(backupInput);
    } catch {
      throw new BackupInvalid(
        'The provided backup data is not valid JSON.',
        'Please ensure you are providing a valid JSON backup file.'
      );
    }
  } else {
    parsedBackup = backupInput;
    try {
      byteSize = new TextEncoder().encode(JSON.stringify(backupInput)).length;
    } catch {
      byteSize = 0;
    }
  }

  const FIFTY_MB = 50 * 1024 * 1024;
  const warnSizeExceeded = byteSize > FIFTY_MB;
  const warning = warnSizeExceeded
    ? 'Backup size exceeds 50 MB. Importing large backups may cause browser performance issues.'
    : undefined;

  if (!parsedBackup || typeof parsedBackup !== 'object') {
    throw new BackupInvalid('The backup payload must be a JSON object.');
  }

  const backupObj = parsedBackup as Record<string, unknown>;

  if (!('backupVersion' in backupObj)) {
    throw new BackupInvalid(
      'Backup is missing the backupVersion field.',
      'Please check that you selected a valid Project Passport backup file.'
    );
  }

  if (backupObj.backupVersion !== 1) {
    throw new BackupInvalid(
      `Unsupported backup version: ${String(backupObj.backupVersion)}. Only backupVersion 1 is supported.`,
      'Please update your backup file or use an application version that supports this backup version.'
    );
  }

  if (!Array.isArray(backupObj.projects)) {
    throw new BackupInvalid('Backup projects must be an array.');
  }

  interface PreparedProject {
    project: ProjectRecord;
    passport: PassportV1;
    conversations: ConversationRecord[];
    files: FileRecord[];
    checkpoints: CheckpointRecord[];
  }

  const prepared: PreparedProject[] = [];

  for (let i = 0; i < backupObj.projects.length; i++) {
    const item = backupObj.projects[i] as Partial<BackupProjectItem>;
    if (!item || typeof item !== 'object') {
      throw new BackupInvalid(`Project entry at index ${i} is not a valid object.`);
    }

    if (!item.project || typeof item.project !== 'object' || !item.project.id) {
      throw new BackupInvalid(
        `Project entry at index ${i} is missing valid project metadata or ID.`
      );
    }

    if (!item.passport) {
      throw new BackupInvalid(
        `Project "${item.project.name || item.project.id}" is missing passport data.`
      );
    }

    const migration = migratePassport(item.passport);
    if (!migration.success || !migration.passport) {
      throw new BackupInvalid(
        `Passport validation failed for project "${item.project.name || item.project.id}": ${migration.errors.join('; ')}`,
        'Fix the passport structure in the backup file and try importing again.'
      );
    }

    const validPassport = migration.passport;
    const projectRecord: ProjectRecord = {
      id: validPassport.project.id,
      name: item.project.name || validPassport.project.name,
      updatedAt: item.project.updatedAt || validPassport.project.updatedAt,
      status: item.project.status || validPassport.project.status,
    };

    const rawFiles = Array.isArray(item.files) ? (item.files as BackupFileRecord[]) : [];
    const files: FileRecord[] = rawFiles.map(deserializeFileFromBackup);

    const conversations: ConversationRecord[] = Array.isArray(item.conversations)
      ? (item.conversations as ConversationRecord[])
      : [];

    const checkpoints: CheckpointRecord[] = Array.isArray(item.checkpoints)
      ? (item.checkpoints as CheckpointRecord[])
      : [];

    prepared.push({
      project: projectRecord,
      passport: validPassport,
      conversations,
      files,
      checkpoints,
    });
  }

  try {
    await db.transaction(
      'rw',
      [db.projects, db.passports, db.checkpoints, db.conversations, db.files],
      async () => {
        for (const item of prepared) {
          // Replace existing project data for this project ID atomically
          await db.projects.delete(item.project.id);
          await db.passports.delete(item.project.id);
          await db.checkpoints.where('projectId').equals(item.project.id).delete();
          await db.conversations.where('projectId').equals(item.project.id).delete();
          await db.files.where('projectId').equals(item.project.id).delete();

          await db.projects.put(item.project);
          await db.passports.put({
            projectId: item.project.id,
            passport: item.passport,
          });
          for (const conv of item.conversations) {
            await db.conversations.put(conv);
          }
          for (const file of item.files) {
            await db.files.put(file);
          }
          for (const cp of item.checkpoints) {
            await db.checkpoints.put(cp);
          }
        }
      }
    );

    return {
      success: true,
      projectsImported: prepared.length,
      warnSizeExceeded,
      warning,
    };
  } catch (err) {
    mapStorageError(err);
  }
}

// ----------------------------------------------------------------------------
// Browser Storage Persistence & Usage Utilities
// ----------------------------------------------------------------------------

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      return await navigator.storage.persist();
    }
  } catch {
    // Fail gracefully
  }
  return false;
}

export interface StorageUsage {
  quota: number;
  usage: number;
  percentUsed: number;
  formattedUsage: string;
  formattedQuota: string;
}

export async function getStorageUsage(): Promise<StorageUsage | null> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota ?? 0;
      const usage = estimate.usage ?? 0;
      const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;
      return {
        quota,
        usage,
        percentUsed,
        formattedUsage: formatBytes(usage),
        formattedQuota: formatBytes(quota),
      };
    }
  } catch {
    // Fail gracefully
  }
  return null;
}
