import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProject,
  listProjects,
  getProject,
  renameProject,
  deleteProject,
  getPassport,
  savePassport,
  addConversation,
  listConversations,
  getConversation,
  removeConversation,
  addFile,
  listFiles,
  getFile,
  removeFile,
  exportEverything,
  importBackup,
  requestPersistentStorage,
  getStorageUsage,
  isAvailable,
  formatBytes,
  uint8ArrayToBase64,
  base64ToUint8Array,
  _setStorageAvailableForTesting,
  StorageUnavailable,
  ValidationFailed,
  BackupInvalid,
  type BackupData,
} from '../index';
import { db } from '../db';
import type { PassportV1 } from '../../domain';

describe('Storage Service & Dexie Layer', () => {
  beforeEach(async () => {
    _setStorageAvailableForTesting(null);
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  it('verifies create, list, rename, and delete lifecycle for projects', async () => {
    const project = await createProject('Alpha Project');
    expect(project.id).toBeDefined();
    expect(project.name).toBe('Alpha Project');
    expect(project.status).toBe('in_progress');

    const list = await listProjects();
    expect(list.length).toBe(1);
    expect(list[0]?.name).toBe('Alpha Project');

    const fetched = await getProject(project.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(project.id);

    await renameProject(project.id, 'Renamed Alpha');
    const renamed = await getProject(project.id);
    expect(renamed?.name).toBe('Renamed Alpha');

    await deleteProject(project.id);
    const afterDelete = await getProject(project.id);
    expect(afterDelete).toBeNull();
    const listAfterDelete = await listProjects();
    expect(listAfterDelete.length).toBe(0);
  });

  it('keeps both project and passport records in sync on renameProject', async () => {
    const project = await createProject('Initial Sync Project');
    const passportBefore = await getPassport(project.id);
    expect(passportBefore).not.toBeNull();
    expect(passportBefore?.project.name).toBe('Initial Sync Project');

    await renameProject(project.id, 'Updated Sync Project');

    const projectAfter = await getProject(project.id);
    const passportAfter = await getPassport(project.id);

    expect(projectAfter?.name).toBe('Updated Sync Project');
    expect(passportAfter?.project.name).toBe('Updated Sync Project');
    expect(projectAfter?.updatedAt).toBe(passportAfter?.project.updatedAt);
  });

  it('cascades deleteProject to passport, checkpoints, conversations, and files in ONE transaction', async () => {
    const project = await createProject('Cascade Test Project');
    const projectId = project.id;

    await db.checkpoints.put({
      id: 'ckpt-1',
      projectId,
      createdAt: new Date().toISOString(),
    });

    await addConversation({
      id: 'conv-1',
      projectId,
      title: 'Design Discussion',
      source: 'claude',
      messages: [{ role: 'user', text: 'Hello AI' }],
      createdAt: new Date().toISOString(),
    });

    await addFile({
      id: 'file-1',
      projectId,
      path: 'README.md',
      mime: 'text/markdown',
      content: '# Hello',
      sizeBytes: 7,
    });

    expect(await db.projects.count()).toBe(1);
    expect(await db.passports.count()).toBe(1);
    expect(await db.checkpoints.count()).toBe(1);
    expect(await db.conversations.count()).toBe(1);
    expect(await db.files.count()).toBe(1);

    await deleteProject(projectId);

    expect(await db.projects.count()).toBe(0);
    expect(await db.passports.count()).toBe(0);
    expect(await db.checkpoints.count()).toBe(0);
    expect(await db.conversations.count()).toBe(0);
    expect(await db.files.count()).toBe(0);
  });

  it('rejects invalid passport data on savePassport and leaves the existing record unchanged', async () => {
    const project = await createProject('Validation Candidate');
    const originalPassport = await getPassport(project.id);
    expect(originalPassport).not.toBeNull();

    const invalidPassport = {
      ...originalPassport,
      project: {
        ...originalPassport?.project,
        name: '', // Empty name violates schema
      },
    } as unknown as PassportV1;

    let thrownError: unknown;
    try {
      await savePassport(invalidPassport);
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ValidationFailed);
    const valErr = thrownError as ValidationFailed;
    expect(valErr.errors.length).toBeGreaterThan(0);
    expect(valErr.errors).toContain('Project name cannot be empty');
    expect(valErr.nextStep).toContain('highlighted validation errors');

    // Confirm that the old passport is completely untouched
    const reloaded = await getPassport(project.id);
    expect(reloaded?.project.name).toBe('Validation Candidate');
  });

  it('preserves bugsReviewed flag across savePassport and getPassport', async () => {
    const project = await createProject('Bugs Review Test');
    const initialPassport = await getPassport(project.id);
    expect(initialPassport?.bugsReviewed).toBe(false);

    // Save with bugsReviewed = true
    const updated = {
      ...initialPassport!,
      bugsReviewed: true,
    };
    await savePassport(updated);

    const reloaded = await getPassport(project.id);
    expect(reloaded?.bugsReviewed).toBe(true);

    // Save with bugsReviewed = false
    const updatedAgain = {
      ...reloaded!,
      bugsReviewed: false,
    };
    await savePassport(updatedAgain);

    const reloadedAgain = await getPassport(project.id);
    expect(reloadedAgain?.bugsReviewed).toBe(false);
  });

  it('handles full backup export and import round trip including chunked binary files', async () => {
    const project = await createProject('Round Trip Project');
    const projectId = project.id;

    await addConversation({
      id: 'conv-rt',
      projectId,
      title: 'Prompt Architecture',
      source: 'chatgpt',
      messages: [
        { role: 'user', text: 'Define the data contract' },
        { role: 'assistant', text: 'Contract established' },
      ],
      createdAt: new Date().toISOString(),
    });

    const textFile = {
      id: 'file-text',
      projectId,
      path: 'docs/architecture.md',
      mime: 'text/markdown',
      content: '# Architecture Spec',
      sizeBytes: 19,
    };
    await addFile(textFile);

    // Create binary data > 65 KB to test 32 KB chunking in uint8ArrayToBase64
    const largeBinarySize = 70000;
    const binaryBytes = new Uint8Array(largeBinarySize);
    for (let i = 0; i < largeBinarySize; i++) {
      binaryBytes[i] = (i * 17) % 256;
    }

    const binaryFile = {
      id: 'file-bin',
      projectId,
      path: 'assets/sample.bin',
      mime: 'application/octet-stream',
      content: binaryBytes,
      sizeBytes: largeBinarySize,
    };
    await addFile(binaryFile);

    const backup = await exportEverything();
    expect(backup.backupVersion).toBe(1);
    expect(backup.createdAt).toBeDefined();
    expect(backup.projects.length).toBe(1);
    expect(backup.projects[0]?.files.length).toBe(2);

    const exportedBin = backup.projects[0]?.files.find((f) => f.id === 'file-bin');
    expect(exportedBin?.isBinary).toBe(true);
    expect(typeof exportedBin?.content).toBe('string');

    // Clear database to simulate restore onto an empty environment
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();

    const importResult = await importBackup(backup);
    expect(importResult.success).toBe(true);
    expect(importResult.projectsImported).toBe(1);
    expect(importResult.warnSizeExceeded).toBe(false);

    // Verify restored records
    const restoredProject = await getProject(projectId);
    expect(restoredProject?.name).toBe('Round Trip Project');

    const restoredPassport = await getPassport(projectId);
    expect(restoredPassport?.project.name).toBe('Round Trip Project');

    const restoredConversations = await listConversations(projectId);
    expect(restoredConversations.length).toBe(1);
    expect(restoredConversations[0]?.title).toBe('Prompt Architecture');

    const restoredFiles = await listFiles(projectId);
    expect(restoredFiles.length).toBe(2);

    const restoredTextFile = await getFile('file-text');
    expect(restoredTextFile?.content).toBe('# Architecture Spec');

    const restoredBinFile = await getFile('file-bin');
    expect(restoredBinFile).not.toBeNull();
    const restoredBytes = restoredBinFile?.content as Uint8Array;
    expect(restoredBytes.length).toBe(largeBinarySize);

    // Compare content array by array (avoiding cross-realm instanceof issues)
    const expectedSample = Array.from(binaryBytes.subarray(0, 100));
    const actualSample = Array.from(restoredBytes.subarray(0, 100));
    expect(actualSample).toEqual(expectedSample);

    const expectedEnd = Array.from(binaryBytes.subarray(69900));
    const actualEnd = Array.from(restoredBytes.subarray(69900));
    expect(actualEnd).toEqual(expectedEnd);
  });

  it('rejects invalid backup and unknown backupVersion with existing data unchanged', async () => {
    const existing = await createProject('Preserved Project');
    const existingPassport = await getPassport(existing.id);

    // Test unknown backupVersion
    const unknownVersionBackup: Record<string, unknown> = {
      backupVersion: 999,
      createdAt: new Date().toISOString(),
      projects: [],
    };

    await expect(importBackup(unknownVersionBackup as unknown as BackupData)).rejects.toThrow(
      BackupInvalid
    );

    // Test invalid JSON string
    await expect(importBackup('not valid json {')).rejects.toThrow(BackupInvalid);

    // Test backup with corrupted passport
    const corruptBackup: Record<string, unknown> = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: { id: 'corrupt', name: 'Corrupt', updatedAt: '', status: 'idea' },
          passport: { schemaVersion: 1, project: { id: 'bad' } }, // Incomplete passport
          conversations: [],
          files: [],
          checkpoints: [],
        },
      ],
    };

    await expect(importBackup(corruptBackup as unknown as BackupData)).rejects.toThrow(
      BackupInvalid
    );

    // Verify existing data remains completely untouched
    const afterFailedImports = await listProjects();
    expect(afterFailedImports.length).toBe(1);
    expect(afterFailedImports[0]?.id).toBe(existing.id);
    const passportAfter = await getPassport(existing.id);
    expect(passportAfter?.project.name).toBe(existingPassport?.project.name);
  });

  it('warns when backup size exceeds 50 MB during import', async () => {
    // Generate a backup string that exceeds 50 MB
    // Construct a synthetic 51 MB string using spaces in a dummy string property
    const targetSize = 51 * 1024 * 1024;
    const baseBackup = await exportEverything();
    const serialized = JSON.stringify(baseBackup);
    const paddingLength = targetSize - serialized.length;
    const padding = ' '.repeat(Math.max(0, paddingLength));
    const paddedJson = serialized.replace(
      '"projects":[]',
      `"projects":[],"_pad":"${padding}"`
    );

    const result = await importBackup(paddedJson);
    expect(result.success).toBe(true);
    expect(result.warnSizeExceeded).toBe(true);
    expect(result.warning).toContain('Backup size exceeds 50 MB');
  });

  it('throws StorageUnavailable when local storage is unavailable or blocked', async () => {
    _setStorageAvailableForTesting(false);
    expect(isAvailable()).toBe(false);

    await expect(createProject('Should Fail')).rejects.toThrow(StorageUnavailable);
    await expect(listProjects()).rejects.toThrow(StorageUnavailable);
    await expect(getProject('any')).rejects.toThrow(StorageUnavailable);
    await expect(renameProject('any', 'name')).rejects.toThrow(StorageUnavailable);
    await expect(deleteProject('any')).rejects.toThrow(StorageUnavailable);
    await expect(getPassport('any')).rejects.toThrow(StorageUnavailable);
    await expect(exportEverything()).rejects.toThrow(StorageUnavailable);
    await expect(
      importBackup({ backupVersion: 1, createdAt: '', projects: [] })
    ).rejects.toThrow(StorageUnavailable);

    _setStorageAvailableForTesting(null);
    expect(isAvailable()).toBe(true);
  });

  it('verifies conversation and file CRUD functions', async () => {
    const project = await createProject('CRUD Assets Project');
    const projectId = project.id;

    // Conversations
    await addConversation({
      id: 'c1',
      projectId,
      title: 'Conv 1',
      source: 'gemini',
      messages: [{ role: 'user', text: 'Hey' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const conv = await getConversation('c1');
    expect(conv?.title).toBe('Conv 1');

    const convList = await listConversations(projectId);
    expect(convList.length).toBe(1);

    await removeConversation('c1');
    expect(await getConversation('c1')).toBeNull();

    // Files
    await addFile({
      id: 'f1',
      projectId,
      path: 'test.txt',
      mime: 'text/plain',
      content: 'Hello File',
      sizeBytes: 10,
    });

    const file = await getFile('f1');
    expect(file?.content).toBe('Hello File');

    const fileList = await listFiles(projectId);
    expect(fileList.length).toBe(1);

    await removeFile('f1');
    expect(await getFile('f1')).toBeNull();
  });

  it('tests uint8ArrayToBase64 and base64ToUint8Array roundtrip', () => {
    const sample = new Uint8Array([0, 1, 2, 255, 128, 42, 64]);
    const b64 = uint8ArrayToBase64(sample);
    const decoded = base64ToUint8Array(b64);
    expect(Array.from(decoded)).toEqual(Array.from(sample));
  });

  it('tests formatBytes utility', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  it('gracefully handles requestPersistentStorage and getStorageUsage when navigator.storage is absent', async () => {
    const persistResult = await requestPersistentStorage();
    expect(typeof persistResult).toBe('boolean');

    const usage = await getStorageUsage();
    // In jsdom without navigator.storage.estimate mock, returns null or usage
    if (usage !== null) {
      expect(usage.formattedUsage).toBeDefined();
      expect(usage.formattedQuota).toBeDefined();
    }
  });
});
