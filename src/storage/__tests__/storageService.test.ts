import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  StorageUnavailable,
  ValidationFailed,
  BackupInvalid,
  type BackupData,
} from '../index';
import { _setStorageAvailableForTesting } from '../testing';
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

  it('rollback proof: deleteProject rolls back all tables when a later write fails before files are deleted', async () => {
    const project = await createProject('Atomic Delete Project');
    const projectId = project.id;

    await db.checkpoints.put({
      id: 'ckpt-del-fail',
      projectId,
      createdAt: new Date().toISOString(),
    });

    await addConversation({
      id: 'conv-del-fail',
      projectId,
      title: 'Rollback Conv',
      source: 'claude',
      messages: [{ role: 'user', text: 'Preserve me' }],
      createdAt: new Date().toISOString(),
    });

    await addFile({
      id: 'file-del-fail',
      projectId,
      path: 'important.txt',
      mime: 'text/plain',
      content: 'Do not delete me if transaction fails',
      sizeBytes: 37,
    });

    expect(await db.projects.get(projectId)).toBeDefined();
    expect(await db.passports.get(projectId)).toBeDefined();
    expect(await db.checkpoints.get('ckpt-del-fail')).toBeDefined();
    expect(await db.conversations.get('conv-del-fail')).toBeDefined();
    expect(await db.files.get('file-del-fail')).toBeDefined();

    // Spy on db.files.where to force an error after passport is deleted but before files are deleted
    const spy = vi.spyOn(db.files, 'where').mockImplementation(() => {
      throw new Error('Simulated failure before files are deleted');
    });

    let thrown: unknown;
    try {
      await deleteProject(projectId);
    } catch (err) {
      thrown = err;
    } finally {
      spy.mockRestore();
    }

    expect(thrown).toBeDefined();

    // Assert that NOTHING changed afterwards: every table still holds the project's data
    const projectAfter = await db.projects.get(projectId);
    expect(projectAfter).toBeDefined();
    expect(projectAfter?.name).toBe('Atomic Delete Project');

    const passportAfter = await db.passports.get(projectId);
    expect(passportAfter).toBeDefined();

    const ckptAfter = await db.checkpoints.get('ckpt-del-fail');
    expect(ckptAfter).toBeDefined();

    const convAfter = await db.conversations.get('conv-del-fail');
    expect(convAfter).toBeDefined();

    const fileAfter = await db.files.get('file-del-fail');
    expect(fileAfter).toBeDefined();
  });

  it('rollback proof: renameProject rolls back both project and passport when updating the second record fails', async () => {
    const project = await createProject('Original Name');
    const projectId = project.id;

    // Spy on db.passports.put (the second record updated in renameProject)
    const spy = vi.spyOn(db.passports, 'put').mockImplementation(() => {
      throw new Error('Simulated failure during passport put in renameProject');
    });

    let thrown: unknown;
    try {
      await renameProject(projectId, 'Brand New Name');
    } catch (err) {
      thrown = err;
    } finally {
      spy.mockRestore();
    }

    expect(thrown).toBeDefined();

    // Assert that both the projects row and the passport still have the OLD name
    const projectAfter = await db.projects.get(projectId);
    const passportAfter = await db.passports.get(projectId);

    expect(projectAfter?.name).toBe('Original Name');
    expect(passportAfter?.passport.project.name).toBe('Original Name');
  });

  it('rollback proof: importBackup rolls back entirely when a second project fails during write, leaving pre-existing data unchanged', async () => {
    // Create pre-existing project
    const preExisting = await createProject('Pre-existing Safe Project');
    const preExistingId = preExisting.id;

    // Prepare backup with 2 new projects
    const backup: BackupData = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: {
            id: 'proj-batch-1',
            name: 'Batch Project 1',
            updatedAt: new Date().toISOString(),
            status: 'idea',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: 'proj-batch-1',
              name: 'Batch Project 1',
              goal: 'Goal 1',
              summary: 'Summary 1',
              status: 'idea',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
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
            nextAction: 'Action 1',
            openQuestions: [],
          },
          conversations: [],
          files: [],
          checkpoints: [],
        },
        {
          project: {
            id: 'proj-batch-2',
            name: 'Batch Project 2',
            updatedAt: new Date().toISOString(),
            status: 'idea',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: 'proj-batch-2',
              name: 'Batch Project 2',
              goal: 'Goal 2',
              summary: 'Summary 2',
              status: 'idea',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
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
            nextAction: 'Action 2',
            openQuestions: [],
          },
          conversations: [],
          files: [],
          checkpoints: [],
        },
      ],
    };

    // Spy on db.projects.put to let the first project write succeed, but throw on the second project write
    const originalPut = db.projects.put.bind(db.projects);
    let putCalls = 0;
    const spy = vi.spyOn(db.projects, 'put').mockImplementation((...args) => {
      putCalls++;
      if (putCalls === 2) {
        throw new Error('Simulated failure writing second project in backup');
      }
      return originalPut(...args);
    });

    let thrown: unknown;
    try {
      await importBackup(backup);
    } catch (err) {
      thrown = err;
    } finally {
      spy.mockRestore();
    }

    expect(thrown).toBeDefined();

    // Assert that neither project exists afterwards
    expect(await db.projects.get('proj-batch-1')).toBeUndefined();
    expect(await db.passports.get('proj-batch-1')).toBeUndefined();
    expect(await db.projects.get('proj-batch-2')).toBeUndefined();
    expect(await db.passports.get('proj-batch-2')).toBeUndefined();

    // Assert that pre-existing data is unchanged
    const preExistingAfter = await db.projects.get(preExistingId);
    expect(preExistingAfter).toBeDefined();
    expect(preExistingAfter?.name).toBe('Pre-existing Safe Project');

    const preExistingPassportAfter = await db.passports.get(preExistingId);
    expect(preExistingPassportAfter?.passport.project.name).toBe('Pre-existing Safe Project');

    const allProjects = await listProjects();
    expect(allProjects.length).toBe(1);
    expect(allProjects[0]?.id).toBe(preExistingId);
  });

  it('replaces existing project with same ID on importBackup, removing old extra conversations and keeping unrelated projects', async () => {
    // 1. Create an unrelated project
    const unrelated = await createProject('Unrelated Project');

    // 2. Create target project that will be replaced
    const target = await createProject('Original Target Project');
    const targetId = target.id;

    // Add 2 conversations to target project: C1 and C2
    await addConversation({
      id: 'conv-stay',
      projectId: targetId,
      title: 'Conversation Stay',
      source: 'claude',
      messages: [{ role: 'user', text: 'Stay' }],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await addConversation({
      id: 'conv-extra',
      projectId: targetId,
      title: 'Conversation Extra Old',
      source: 'chatgpt',
      messages: [{ role: 'user', text: 'Extra' }],
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    expect((await listConversations(targetId)).length).toBe(2);

    // 3. Prepare backup containing targetId, but ONLY containing conv-stay (conv-extra is omitted)
    const backup: BackupData = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: {
            id: targetId,
            name: 'Replaced Target Project',
            updatedAt: new Date().toISOString(),
            status: 'done',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: targetId,
              name: 'Replaced Target Project',
              goal: 'Replaced Goal',
              summary: 'Replaced Summary',
              status: 'done',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            stack: [{ name: 'React', role: 'Frontend' }],
            requirements: [],
            decisions: [],
            completed: [],
            tasks: [],
            bugs: [],
            bugsReviewed: true,
            instructions: [],
            files: [],
            conversations: [],
            nextAction: 'Ready to ship',
            openQuestions: [],
          },
          conversations: [
            {
              id: 'conv-stay',
              projectId: targetId,
              title: 'Conversation Stay Updated',
              source: 'claude',
              messages: [{ role: 'user', text: 'Stay Updated' }],
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          files: [],
          checkpoints: [],
        },
      ],
    };

    const res = await importBackup(backup);
    expect(res.success).toBe(true);
    expect(res.projectsImported).toBe(1);

    // Check target project was replaced
    const targetAfter = await getProject(targetId);
    expect(targetAfter?.name).toBe('Replaced Target Project');
    expect(targetAfter?.status).toBe('done');

    const passportAfter = await getPassport(targetId);
    expect(passportAfter?.project.name).toBe('Replaced Target Project');
    expect(passportAfter?.bugsReviewed).toBe(true);

    // Old extra conversation is gone after restore!
    const targetConvs = await listConversations(targetId);
    expect(targetConvs.length).toBe(1);
    expect(targetConvs[0]?.id).toBe('conv-stay');
    expect(targetConvs[0]?.title).toBe('Conversation Stay Updated');
    expect(await getConversation('conv-extra')).toBeNull();

    // Unrelated project is preserved
    const unrelatedAfter = await getProject(unrelated.id);
    expect(unrelatedAfter).not.toBeNull();
    expect(unrelatedAfter?.name).toBe('Unrelated Project');
  });

  it('imports backup into an empty database successfully', async () => {
    // Ensure database is completely empty
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();

    expect(await db.projects.count()).toBe(0);

    const backup: BackupData = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: {
            id: 'fresh-proj-1',
            name: 'Fresh Database Project',
            updatedAt: new Date().toISOString(),
            status: 'idea',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: 'fresh-proj-1',
              name: 'Fresh Database Project',
              goal: 'Bootstrap',
              summary: 'Starting from scratch',
              status: 'idea',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
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
            nextAction: 'First task',
            openQuestions: [],
          },
          conversations: [],
          files: [],
          checkpoints: [],
        },
      ],
    };

    const result = await importBackup(backup);
    expect(result.success).toBe(true);
    expect(result.projectsImported).toBe(1);

    const importedProject = await getProject('fresh-proj-1');
    expect(importedProject).not.toBeNull();
    expect(importedProject?.name).toBe('Fresh Database Project');

    const importedPassport = await getPassport('fresh-proj-1');
    expect(importedPassport?.project.name).toBe('Fresh Database Project');
  });

  it('savePassport updates project.updatedAt to a later value and keeps passport project.id and name in sync with projects row', async () => {
    const project = await createProject('Initial Project Name');
    const initialUpdatedAt = project.updatedAt;

    // Small delay to ensure timestamp strictly advances
    await new Promise((resolve) => setTimeout(resolve, 15));

    const passport = (await getPassport(project.id))!;
    expect(passport.project.id).toBe(project.id);
    expect(passport.project.name).toBe('Initial Project Name');

    // Update the passport name and save
    passport.project.name = 'Updated In Passport';
    await savePassport(passport);

    const updatedProject = (await getProject(project.id))!;
    const updatedPassport = (await getPassport(project.id))!;

    // project.updatedAt is updated to a later value
    expect(new Date(updatedProject.updatedAt).getTime()).toBeGreaterThan(
      new Date(initialUpdatedAt).getTime()
    );

    // Keeps passport's project.id and name in sync with projects row
    expect(updatedPassport.project.id).toBe(project.id);
    expect(updatedProject.id).toBe(project.id);
    expect(updatedPassport.project.name).toBe('Updated In Passport');
    expect(updatedProject.name).toBe('Updated In Passport');
    expect(updatedProject.updatedAt).toBe(updatedPassport.project.updatedAt);
  });

  it('confirms production isAvailable actually tries to open the database and catches open errors', async () => {
    _setStorageAvailableForTesting(null);

    // Normal state: opens successfully
    expect(await isAvailable()).toBe(true);

    // Spy on db.open to simulate failure (e.g. storage blocked or private mode)
    const spy = vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('IndexedDB blocked'));
    expect(await isAvailable()).toBe(false);
    spy.mockRestore();

    // When restored, isAvailable succeeds again
    expect(await isAvailable()).toBe(true);
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
    expect(await isAvailable()).toBe(false);

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
    expect(await isAvailable()).toBe(true);
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
