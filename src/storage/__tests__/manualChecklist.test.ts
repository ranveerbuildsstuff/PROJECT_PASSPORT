import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as storageExports from '../index';
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
  addFile,
  getFile,
  importBackup,
  isAvailable,
  type BackupData,
} from '../index';
import { _setStorageAvailableForTesting } from '../testing';
import { db } from '../db';

describe('Manual Testing Checklist — Complete 8 Tests', () => {
  beforeEach(async () => {
    _setStorageAvailableForTesting(null);
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Test 1 — Test Hook Isolation
  // --------------------------------------------------------------------------
  it('Test 1 — Test Hook Isolation: _setStorageAvailableForTesting is not exported from src/storage/index.ts', () => {
    const exportedKeys = Object.keys(storageExports);

    // Verify _setStorageAvailableForTesting is not in public barrel exports
    expect(exportedKeys).not.toContain('_setStorageAvailableForTesting');
    expect('_setStorageAvailableForTesting' in storageExports).toBe(false);
    expect(
      (storageExports as Record<string, unknown>)['_setStorageAvailableForTesting']
    ).toBeUndefined();

    // Verify getTestingStorageOverride is also not in public barrel exports
    expect(exportedKeys).not.toContain('getTestingStorageOverride');
    expect('getTestingStorageOverride' in storageExports).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Test 2 — Production isAvailable Probe
  // --------------------------------------------------------------------------
  it('Test 2 — Production isAvailable Probe: actively awaits db.open(), returns false if db.open() rejects', async () => {
    // Ensure test override is cleared
    _setStorageAvailableForTesting(null);

    // 1. Verify normal behavior when database opens cleanly
    const normalAvailability = await isAvailable();
    expect(normalAvailability).toBe(true);

    // 2. Spy on db.open and force rejection
    const openSpy = vi
      .spyOn(db, 'open')
      .mockRejectedValueOnce(new Error('IndexedDB blocked by browser security policy'));

    const probeResult = await isAvailable();

    // Verify db.open was actively awaited
    expect(openSpy).toHaveBeenCalled();
    // Verify it returns false when db.open rejects
    expect(probeResult).toBe(false);

    openSpy.mockRestore();

    // 3. Verify rejection with DOMException SecurityError
    const secSpy = vi
      .spyOn(db, 'open')
      .mockRejectedValueOnce(
        new DOMException('A mutation operation was attempted in a read-only transaction', 'SecurityError')
      );

    const secResult = await isAvailable();
    expect(secSpy).toHaveBeenCalled();
    expect(secResult).toBe(false);

    secSpy.mockRestore();

    // 4. Verify that once db.open is working again, isAvailable accurately reports true
    expect(await isAvailable()).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Test 3 — Rollback on Failed Rename
  // --------------------------------------------------------------------------
  it('Test 3 — Rollback on Failed Rename: project name in projects table remains unchanged if passports.put fails', async () => {
    const project = await createProject('Alpha Original Name');
    const projectId = project.id;

    // Spy on db.passports.put and inject failure
    const putSpy = vi.spyOn(db.passports, 'put').mockImplementation(() => {
      throw new Error('Injected failure during db.passports.put in renameProject');
    });

    let caughtError: unknown;
    try {
      await renameProject(projectId, 'Alpha Renamed Target');
    } catch (err) {
      caughtError = err;
    } finally {
      putSpy.mockRestore();
    }

    expect(caughtError).toBeDefined();

    // Verify projects table remains unchanged
    const projectAfter = await db.projects.get(projectId);
    expect(projectAfter).toBeDefined();
    expect(projectAfter?.name).toBe('Alpha Original Name');

    // Verify passports table also remains unchanged
    const passportAfter = await db.passports.get(projectId);
    expect(passportAfter).toBeDefined();
    expect(passportAfter?.passport.project.name).toBe('Alpha Original Name');
  });

  // --------------------------------------------------------------------------
  // Test 4 — Rollback on Failed Delete
  // --------------------------------------------------------------------------
  it('Test 4 — Rollback on Failed Delete: all entities remain intact if db.files.where fails during deleteProject', async () => {
    const project = await createProject('Delete Candidate Project');
    const projectId = project.id;

    await db.checkpoints.put({
      id: 'ckpt-test-4',
      projectId,
      createdAt: new Date().toISOString(),
    });

    await addConversation({
      id: 'conv-test-4',
      projectId,
      title: 'Rollback Conversation',
      source: 'claude',
      messages: [{ role: 'user', text: 'Important turn' }],
      createdAt: new Date().toISOString(),
    });

    await addFile({
      id: 'file-test-4',
      projectId,
      path: 'docs/important.md',
      mime: 'text/markdown',
      content: '# Do not lose this content',
      sizeBytes: 25,
    });

    // Ensure all 5 items exist
    expect(await db.projects.get(projectId)).toBeDefined();
    expect(await db.passports.get(projectId)).toBeDefined();
    expect(await db.checkpoints.get('ckpt-test-4')).toBeDefined();
    expect(await db.conversations.get('conv-test-4')).toBeDefined();
    expect(await db.files.get('file-test-4')).toBeDefined();

    // Spy on db.files.where to force an error at the final step of the cascade
    const filesWhereSpy = vi.spyOn(db.files, 'where').mockImplementation(() => {
      throw new Error('Injected failure during db.files.where');
    });

    let caughtError: unknown;
    try {
      await deleteProject(projectId);
    } catch (err) {
      caughtError = err;
    } finally {
      filesWhereSpy.mockRestore();
    }

    expect(caughtError).toBeDefined();

    // Verify all 5 entities remain completely intact
    const projectAfter = await db.projects.get(projectId);
    expect(projectAfter).toBeDefined();
    expect(projectAfter?.name).toBe('Delete Candidate Project');

    const passportAfter = await db.passports.get(projectId);
    expect(passportAfter).toBeDefined();
    expect(passportAfter?.projectId).toBe(projectId);

    const checkpointAfter = await db.checkpoints.get('ckpt-test-4');
    expect(checkpointAfter).toBeDefined();

    const conversationAfter = await db.conversations.get('conv-test-4');
    expect(conversationAfter).toBeDefined();
    expect(conversationAfter?.title).toBe('Rollback Conversation');

    const fileAfter = await db.files.get('file-test-4');
    expect(fileAfter).toBeDefined();
    expect(fileAfter?.content).toBe('# Do not lose this content');
  });

  // --------------------------------------------------------------------------
  // Test 5 — Rollback on Failed Batch Restore
  // --------------------------------------------------------------------------
  it('Test 5 — Rollback on Failed Batch Restore: neither project written, existing data intact on failure', async () => {
    // 1. Create existing database project
    const existing = await createProject('Pre-existing Safe Project');
    const existingId = existing.id;

    // 2. Prepare backup containing two projects
    const backup: BackupData = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: {
            id: 'batch-proj-1',
            name: 'Batch Project 1',
            updatedAt: new Date().toISOString(),
            status: 'idea',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: 'batch-proj-1',
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
            id: 'batch-proj-2',
            name: 'Batch Project 2',
            updatedAt: new Date().toISOString(),
            status: 'idea',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: 'batch-proj-2',
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

    // 3. Inject write failure specifically on Project 2
    const originalPut = db.projects.put.bind(db.projects);
    const putSpy = vi.spyOn(db.projects, 'put').mockImplementation((...args) => {
      const record = args[0] as { id?: string } | undefined;
      if (record?.id === 'batch-proj-2') {
        throw new Error('Injected write failure on batch-proj-2');
      }
      return originalPut(...args);
    });

    let caughtError: unknown;
    try {
      await importBackup(backup);
    } catch (err) {
      caughtError = err;
    } finally {
      putSpy.mockRestore();
    }

    expect(caughtError).toBeDefined();

    // Verify Project 1 was NOT written
    expect(await db.projects.get('batch-proj-1')).toBeUndefined();
    expect(await db.passports.get('batch-proj-1')).toBeUndefined();

    // Verify Project 2 was NOT written
    expect(await db.projects.get('batch-proj-2')).toBeUndefined();
    expect(await db.passports.get('batch-proj-2')).toBeUndefined();

    // Verify existing database project remains intact
    const existingAfter = await db.projects.get(existingId);
    expect(existingAfter).toBeDefined();
    expect(existingAfter?.name).toBe('Pre-existing Safe Project');

    // Verify no partially restored data remains
    const allProjects = await listProjects();
    expect(allProjects.length).toBe(1);
    expect(allProjects[0]?.id).toBe(existingId);
  });

  // --------------------------------------------------------------------------
  // Test 6 — Same-ID Backup Replace
  // --------------------------------------------------------------------------
  it('Test 6 — Same-ID Backup Replace: replaces project data and deletes omitted conversation', async () => {
    // 1. Create target project that will be replaced
    const target = await createProject('Target Project Before Backup');
    const targetId = target.id;

    // Add two conversations
    await addConversation({
      id: 'conv-retained',
      projectId: targetId,
      title: 'Retained Conversation',
      source: 'claude',
      messages: [{ role: 'user', text: 'Preserve this turn' }],
      createdAt: '2026-02-01T10:00:00.000Z',
    });
    await addConversation({
      id: 'conv-omitted',
      projectId: targetId,
      title: 'Omitted Conversation To Be Removed',
      source: 'chatgpt',
      messages: [{ role: 'user', text: 'This turn must be deleted' }],
      createdAt: '2026-02-01T11:00:00.000Z',
    });

    expect((await listConversations(targetId)).length).toBe(2);

    // 2. Prepare backup with same ID, updated details, and ONLY conv-retained (conv-omitted is omitted)
    const backup: BackupData = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: {
            id: targetId,
            name: 'Target Project Replaced Successfully',
            updatedAt: new Date().toISOString(),
            status: 'done',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: targetId,
              name: 'Target Project Replaced Successfully',
              goal: 'Updated Goal',
              summary: 'Updated Summary',
              status: 'done',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            stack: [{ name: 'Vite', role: 'Bundler' }],
            requirements: [],
            decisions: [],
            completed: [],
            tasks: [],
            bugs: [],
            bugsReviewed: true,
            instructions: [],
            files: [],
            conversations: [],
            nextAction: 'Ship release',
            openQuestions: [],
          },
          conversations: [
            {
              id: 'conv-retained',
              projectId: targetId,
              title: 'Retained Conversation Updated Title',
              source: 'claude',
              messages: [{ role: 'user', text: 'Preserve this turn' }],
              createdAt: '2026-02-01T10:00:00.000Z',
            },
          ],
          files: [],
          checkpoints: [],
        },
      ],
    };

    const importResult = await importBackup(backup);
    expect(importResult.success).toBe(true);
    expect(importResult.projectsImported).toBe(1);

    // Verify existing project data is replaced
    const projectAfter = await getProject(targetId);
    expect(projectAfter?.name).toBe('Target Project Replaced Successfully');
    expect(projectAfter?.status).toBe('done');

    const passportAfter = await getPassport(targetId);
    expect(passportAfter?.project.name).toBe('Target Project Replaced Successfully');
    expect(passportAfter?.bugsReviewed).toBe(true);

    // Verify the omitted conversation is deleted
    const conversationsAfter = await listConversations(targetId);
    expect(conversationsAfter.length).toBe(1);
    expect(conversationsAfter[0]?.id).toBe('conv-retained');
    expect(conversationsAfter[0]?.title).toBe('Retained Conversation Updated Title');

    const omittedConvRecord = await getConversation('conv-omitted');
    expect(omittedConvRecord).toBeNull();
  });

  // --------------------------------------------------------------------------
  // Test 7 — Empty DB Backup Restore
  // --------------------------------------------------------------------------
  it('Test 7 — Empty DB Backup Restore: restores all projects, passports, and files with correct relationships', async () => {
    // 1. Confirm database is completely empty
    expect(await db.projects.count()).toBe(0);
    expect(await db.passports.count()).toBe(0);
    expect(await db.files.count()).toBe(0);
    expect(await db.conversations.count()).toBe(0);
    expect(await db.checkpoints.count()).toBe(0);

    const freshProjectId = 'empty-db-proj-100';

    // 2. Prepare valid backup with project, passport, file, conversation, checkpoint
    const backup: BackupData = {
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      projects: [
        {
          project: {
            id: freshProjectId,
            name: 'Fresh Restored Project',
            updatedAt: '2026-03-01T12:00:00.000Z',
            status: 'in_progress',
          },
          passport: {
            schemaVersion: 1,
            project: {
              id: freshProjectId,
              name: 'Fresh Restored Project',
              goal: 'Restore from zero',
              summary: 'Initial project summary',
              status: 'in_progress',
              createdAt: '2026-03-01T12:00:00.000Z',
              updatedAt: '2026-03-01T12:00:00.000Z',
            },
            stack: [{ name: 'TypeScript', role: 'Language' }],
            requirements: [
              { id: 'req-1', text: '100% offline functionality', priority: 'must' },
            ],
            decisions: [],
            completed: [],
            tasks: [],
            bugs: [],
            bugsReviewed: true,
            instructions: [],
            files: [
              {
                path: 'docs/guide.md',
                purpose: 'User Guide',
                included: true,
                sizeBytes: 52,
              },
            ],
            conversations: [],
            nextAction: 'Configure environment',
            openQuestions: [],
          },
          files: [
            {
              id: 'file-doc-1',
              projectId: freshProjectId,
              path: 'docs/guide.md',
              mime: 'text/markdown',
              content: '# Complete User Guide\n\nWelcome to Project Passport.',
              isBinary: false,
              sizeBytes: 52,
            },
          ],
          conversations: [
            {
              id: 'conv-init-1',
              projectId: freshProjectId,
              title: 'Onboarding Session',
              source: 'chatgpt',
              messages: [{ role: 'user', text: 'How do I start?' }],
              createdAt: '2026-03-01T12:05:00.000Z',
            },
          ],
          checkpoints: [
            {
              id: 'ckpt-init-1',
              projectId: freshProjectId,
              createdAt: '2026-03-01T12:10:00.000Z',
            },
          ],
        },
      ],
    };

    const importResult = await importBackup(backup);
    expect(importResult.success).toBe(true);
    expect(importResult.projectsImported).toBe(1);

    // Verify Project
    const restoredProject = await getProject(freshProjectId);
    expect(restoredProject).not.toBeNull();
    expect(restoredProject?.id).toBe(freshProjectId);
    expect(restoredProject?.name).toBe('Fresh Restored Project');

    // Verify Passport
    const restoredPassport = await getPassport(freshProjectId);
    expect(restoredPassport).not.toBeNull();
    expect(restoredPassport?.project.id).toBe(freshProjectId);
    expect(restoredPassport?.project.name).toBe('Fresh Restored Project');
    expect(restoredPassport?.requirements[0]?.text).toBe('100% offline functionality');

    // Verify File
    const restoredFile = await getFile('file-doc-1');
    expect(restoredFile).not.toBeNull();
    expect(restoredFile?.projectId).toBe(freshProjectId);
    expect(restoredFile?.path).toBe('docs/guide.md');
    expect(restoredFile?.content).toBe('# Complete User Guide\n\nWelcome to Project Passport.');

    // Verify Conversation
    const restoredConv = await getConversation('conv-init-1');
    expect(restoredConv).not.toBeNull();
    expect(restoredConv?.projectId).toBe(freshProjectId);
    expect(restoredConv?.title).toBe('Onboarding Session');

    // Verify Checkpoint
    const restoredCkpt = await db.checkpoints.get('ckpt-init-1');
    expect(restoredCkpt).toBeDefined();
    expect(restoredCkpt?.projectId).toBe(freshProjectId);

    // Verify Relationships
    expect(restoredPassport?.project.id).toBe(restoredProject?.id);
    expect(restoredFile?.projectId).toBe(restoredProject?.id);
    expect(restoredConv?.projectId).toBe(restoredProject?.id);
    expect(restoredCkpt?.projectId).toBe(restoredProject?.id);
  });

  // --------------------------------------------------------------------------
  // Test 8 — SavePassport Sync and Timestamp
  // --------------------------------------------------------------------------
  it('Test 8 — SavePassport Sync and Timestamp: updatedAt advances and projects/passport remain strictly in sync', async () => {
    // 1. Establish controlled clock (only faking Date to keep Dexie microtasks intact)
    const initialIso = '2026-05-10T08:00:00.000Z';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(initialIso));

    const project = await createProject('Initial Sync Project');
    const initialUpdatedAt = project.updatedAt;
    expect(initialUpdatedAt).toBe(initialIso);

    const initialPassport = await getPassport(project.id);
    expect(initialPassport?.project.name).toBe('Initial Sync Project');
    expect(initialPassport?.project.updatedAt).toBe(initialIso);

    // 2. Advance controlled clock by 30 seconds
    const advancedIso = '2026-05-10T08:00:30.000Z';
    vi.setSystemTime(new Date(advancedIso));

    // 3. Mutate project name in passport and invoke savePassport
    const passportToUpdate = {
      ...initialPassport!,
      project: {
        ...initialPassport!.project,
        name: 'Updated Sync Project Name',
      },
    };

    await savePassport(passportToUpdate);

    // 4. Reload from database
    const projectAfter = (await db.projects.get(project.id))!;
    const passportAfter = (await getPassport(project.id))!;

    // Assert: projects.updatedAt advances to newer timestamp
    expect(new Date(projectAfter.updatedAt).getTime()).toBeGreaterThan(
      new Date(initialUpdatedAt).getTime()
    );
    expect(projectAfter.updatedAt).toBe(advancedIso);

    // Assert: passport.project.updatedAt matches projects.updatedAt
    expect(passportAfter.project.updatedAt).toBe(projectAfter.updatedAt);
    expect(passportAfter.project.updatedAt).toBe(advancedIso);

    // Assert: Both records contain the expected updated project name
    expect(projectAfter.name).toBe('Updated Sync Project Name');
    expect(passportAfter.project.name).toBe('Updated Sync Project Name');
  });
});
