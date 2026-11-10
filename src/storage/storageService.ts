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
} from './errors';
import {
  createEmptyPassport,
  validatePassport,
  migratePassport,
  type PassportV1,
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
    err instanceof ProjectNotFound
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

export async function savePassport(passport: PassportV1): Promise<void> {
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

// ----------------------------------------------------------------------------
// Conversation Operations
// ----------------------------------------------------------------------------

export async function addConversation(conversation: ConversationRecord): Promise<string> {
  await ensureAvailable();
  try {
    await db.conversations.put(conversation);
    return conversation.id;
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

export async function removeConversation(id: string): Promise<void> {
  await ensureAvailable();
  try {
    await db.conversations.delete(id);
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

export async function removeFile(id: string): Promise<void> {
  await ensureAvailable();
  try {
    await db.files.delete(id);
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
