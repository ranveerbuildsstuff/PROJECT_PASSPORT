import { describe, it, expect, beforeEach, vi } from 'vitest';
import Dexie from 'dexie';
import { db, type CheckpointRecord } from '../db';
import {
  createProject,
  getProject,
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  getCheckpoint,
  exportEverything,
  importBackup,
  addProjectFiles,
  addPastedConversation,
} from '../storageService';
import { StaleWrite } from '../errors';

describe('Checkpoint Storage Service', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  it('creates a checkpoint with file hashes and included conversation IDs', async () => {
    const proj = await createProject('Alpha Project');

    // Attach two files: one included, one excluded
    await addProjectFiles(proj.id, [
      {
        path: 'src/main.ts',
        purpose: 'App Entry',
        content: 'console.log("hello world");',
        sizeBytes: 27,
        included: true,
      },
      {
        path: 'src/excluded.ts',
        purpose: 'Excluded file',
        content: 'const secret = 42;',
        sizeBytes: 18,
        included: false,
      },
    ]);

    // Add a conversation
    const convId = await addPastedConversation(proj.id, {
      title: 'Design discussion',
      source: 'chatgpt',
      turns: [{ id: 't1', role: 'user', text: 'How should we build checkpoints?' }],
      included: true,
    });

    const checkpointId = await createCheckpoint(proj.id, { note: 'Initial baseline' });
    expect(checkpointId).toBeTruthy();

    const cp = await getCheckpoint(checkpointId);
    expect(cp).toBeDefined();
    expect(cp?.type).toBe('manual');
    expect(cp?.note).toBe('Initial baseline');
    expect(cp?.conversationIds).toEqual([convId]);

    // Files check: included has 64-char hex sha256, excluded has null
    expect(cp?.files).toHaveLength(2);
    const mainFile = cp?.files?.find((f) => f.path === 'src/main.ts');
    const excludedFile = cp?.files?.find((f) => f.path === 'src/excluded.ts');

    expect(mainFile?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(excludedFile?.sha256).toBeNull();
  });

  it('lists checkpoints sorted newest first', async () => {
    const proj = await createProject('Timeline Project');

    const cp1 = await createCheckpoint(proj.id, { note: 'First' });
    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));
    const cp2 = await createCheckpoint(proj.id, { note: 'Second' });
    await new Promise((r) => setTimeout(r, 10));
    const cp3 = await createCheckpoint(proj.id, { note: 'Third' });

    const list = await listCheckpoints(proj.id);
    expect(list).toHaveLength(3);
    expect(list[0]!.id).toBe(cp3);
    expect(list[1]!.id).toBe(cp2);
    expect(list[2]!.id).toBe(cp1);
  });

  it('enforces stale-write guard with expectedUpdatedAt', async () => {
    const proj = await createProject('Stale Project');

    await expect(
      createCheckpoint(proj.id, {
        note: 'Stale attempt',
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
    ).rejects.toThrow(StaleWrite);
  });

  it('restoreCheckpoint throws StaleWrite and writes nothing when expectedUpdatedAt is stale', async () => {
    const proj = await createProject('Restore Stale Project');
    const cpId = await createCheckpoint(proj.id, { note: 'Initial CP' });

    // Modify passport in storage
    const passRec = await db.passports.get(proj.id);
    const originalGoal = passRec!.passport.project.goal;
    const originalUpdatedAt = passRec!.passport.project.updatedAt;
    const initialCheckpointCount = (await listCheckpoints(proj.id)).length;

    // Call restoreCheckpoint with a stale expectedUpdatedAt
    await expect(
      restoreCheckpoint(cpId, {
        expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
      })
    ).rejects.toThrow(StaleWrite);

    // Verify nothing was written
    const postPassRec = await db.passports.get(proj.id);
    expect(postPassRec!.passport.project.goal).toBe(originalGoal);
    expect(postPassRec!.passport.project.updatedAt).toBe(originalUpdatedAt);

    const postProj = await getProject(proj.id);
    expect(postProj!.updatedAt).toBe(proj.updatedAt);

    const postCheckpointList = await listCheckpoints(proj.id);
    expect(postCheckpointList).toHaveLength(initialCheckpointCount);
  });

  it('restores checkpoint: replaces editor fields only, keeps files & conversations, creates "Before restore" checkpoint', async () => {
    const proj = await createProject('Restore Project');

    // Step 1: Create baseline checkpoint with specific tasks and files
    await addProjectFiles(proj.id, [
      {
        path: 'src/existing.ts',
        purpose: 'Original file',
        content: 'const original = true;',
        sizeBytes: 22,
        included: true,
      },
    ]);

    const initialCheckpointId = await createCheckpoint(proj.id, { note: 'V1 Checkpoint' });

    // Step 2: Make subsequent edits in project passport, attach a new file and a new conversation
    const passportRecord = await db.passports.get(proj.id);
    const p = passportRecord!.passport;
    p.project.name = 'Renamed Project';
    p.tasks = [{ id: 't-new', text: 'New task added after checkpoint', status: 'todo', priority: 'high' }];
    await db.passports.put({ projectId: proj.id, passport: p });

    await addProjectFiles(proj.id, [
      {
        path: 'src/new-after.ts',
        purpose: 'Added after checkpoint',
        content: 'const brandNew = true;',
        sizeBytes: 22,
        included: true,
      },
    ]);

    const newConvId = await addPastedConversation(proj.id, {
      title: 'Chat added after checkpoint',
      source: 'claude',
      turns: [{ id: 't2', role: 'user', text: 'Chat turn' }],
      included: true,
    });

    // Step 3: Restore initial checkpoint
    const restored = await restoreCheckpoint(initialCheckpointId);

    // Assert: Editor fields reverted to V1
    expect(restored.project.name).toBe('Restore Project');
    expect(restored.tasks).toEqual([]); // task t-new was removed because it was not in V1

    // Assert: Files and conversations were PRESERVED (Restore decision invariant)
    expect(restored.files.some((f) => f.path === 'src/existing.ts')).toBe(true);
    expect(restored.files.some((f) => f.path === 'src/new-after.ts')).toBe(true);
    expect(restored.conversations.some((c) => c.id === newConvId)).toBe(true);

    // Assert: Automatic "Before restore" checkpoint was created
    const checkpoints = await listCheckpoints(proj.id);
    expect(checkpoints.length).toBeGreaterThanOrEqual(2);
    const beforeRestore = checkpoints.find((c) => c.type === 'before_restore' || c.description === 'Before restore');
    expect(beforeRestore).toBeDefined();
    expect(beforeRestore?.passport?.project.name).toBe('Renamed Project');
  });

  it('rolls back completely if transaction fails during restoreCheckpoint', async () => {
    const proj = await createProject('Rollback Project');
    const cpId = await createCheckpoint(proj.id, { note: 'Saved CP' });

    // Spy on db.passports.put to throw an error inside the transaction
    vi.spyOn(db.passports, 'put').mockRejectedValueOnce(
      new Error('Simulated disk failure during restore write')
    );

    await expect(restoreCheckpoint(cpId)).rejects.toThrow();

    // Verify rollback: no "Before restore" checkpoint remains persisted
    const allCps = await listCheckpoints(proj.id);
    expect(allCps).toHaveLength(1);
    expect(allCps[0]!.id).toBe(cpId);
  });

  it('rolls back completely if transaction fails during createCheckpoint', async () => {
    const proj = await createProject('Rollback Create');

    // Spy on db.checkpoints.put to simulate failure
    vi.spyOn(db.checkpoints, 'put').mockRejectedValueOnce(
      new Error('Simulated checkpoint save failure')
    );

    await expect(createCheckpoint(proj.id, { note: 'Failed save' })).rejects.toThrow();

    const allCps = await listCheckpoints(proj.id);
    expect(allCps).toHaveLength(0);
  });

  it('handles legacy checkpoints cleanly on restore', async () => {
    const proj = await createProject('Legacy Project');

    // Manually insert a legacy checkpoint lacking files and conversationIds
    const passportRecord = await db.passports.get(proj.id);
    const legacyCp = {
      id: 'legacy-cp-1',
      projectId: proj.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      description: 'Before AI merge',
      passport: {
        ...passportRecord!.passport,
        project: {
          ...passportRecord!.passport.project,
          name: 'Legacy Restored Name',
        },
      },
    };
    await db.checkpoints.put(legacyCp as unknown as CheckpointRecord);

    const restored = await restoreCheckpoint('legacy-cp-1');
    expect(restored.project.name).toBe('Legacy Restored Name');
  });

  it('preserves checkpoints and all extra fields through backup export and import round trip', async () => {
    const proj = await createProject('Backup CP Project');
    await addProjectFiles(proj.id, [
      { path: 'src/app.ts', purpose: 'App', content: 'app code', sizeBytes: 8, included: true },
    ]);
    const cpId = await createCheckpoint(proj.id, { note: 'Backup snapshot' });

    const backup = await exportEverything();
    expect(backup.projects[0]?.checkpoints).toHaveLength(1);
    expect(backup.projects[0]?.checkpoints[0]?.id).toBe(cpId);
    expect(backup.projects[0]?.checkpoints[0]?.note).toBe('Backup snapshot');

    // Clear DB and restore from backup
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();

    await importBackup(backup);

    const restoredCps = await listCheckpoints(proj.id);
    expect(restoredCps).toHaveLength(1);
    expect(restoredCps[0]!.id).toBe(cpId);
    expect(restoredCps[0]!.note).toBe('Backup snapshot');
    expect(restoredCps[0]!.files?.[0]?.path).toBe('src/app.ts');
  });

  it('retries once and succeeds if concurrent change happened during hash computation on first try', async () => {
    const proj = await createProject('Retry Success Project');

    let txCount = 0;
    const originalGet = db.projects.get.bind(db.projects);
    const getSpy = vi.spyOn(db.projects, 'get').mockImplementation(((async (id: string) => {
      const res = await originalGet(id);
      if (res && Dexie.currentTransaction) {
        txCount++;
        if (txCount === 1) {
          // Simulate concurrent edit during first transaction check
          return {
            ...res,
            updatedAt: '2026-01-01T99:99:99.000Z',
          };
        }
      }
      return res;
    }) as unknown as typeof db.projects.get));

    try {
      const cpId = await createCheckpoint(proj.id);
      expect(cpId).toBeDefined();
      expect(txCount).toBe(2); // First failed and retried, second succeeded
    } finally {
      getSpy.mockRestore();
    }
  });

  it('retries once and then throws StaleWrite when the project changes between read and write on retry', async () => {
    const proj = await createProject('Retry Stale Project');

    let txCount = 0;
    const originalGet = db.projects.get.bind(db.projects);
    const getSpy = vi.spyOn(db.projects, 'get').mockImplementation(((async (id: string) => {
      const res = await originalGet(id);
      if (res && Dexie.currentTransaction) {
        txCount++;
        // Always simulate concurrent edit inside transaction
        return {
          ...res,
          updatedAt: `2026-01-01T00:00:${String(txCount).padStart(2, '0')}.000Z`,
        };
      }
      return res;
    }) as unknown as typeof db.projects.get));

    try {
      await expect(createCheckpoint(proj.id)).rejects.toThrow(StaleWrite);
      expect(txCount).toBe(2); // Attempted once, retried once, then threw StaleWrite
    } finally {
      getSpy.mockRestore();
    }
  });
});
