import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createProject,
  getProject,
  getPassport,
  addProjectFiles,
  updateProjectFileMeta,
  removeProjectFile,
  restoreProjectFile,
  acknowledgeFinding,
  getProjectFile,
  StaleWrite,
  ValidationFailed,
} from '../index';
import { db } from '../db';

describe('file storage service operations', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  it('addProjectFiles creates FileRecord and keeps passport.files in sync', async () => {
    const project = await createProject('Files Test Project');
    const projectId = project.id;
    const projectBefore = await getProject(projectId);

    await new Promise((r) => setTimeout(r, 10));

    const eventSpy = vi.fn();
    window.addEventListener('project-storage-updated', eventSpy);

    const added = await addProjectFiles(projectId, [
      {
        path: 'src/main.ts',
        content: 'console.log("Hello, world!");',
        sizeBytes: 29,
        included: true,
      },
      {
        path: 'docs/README.md',
        content: '# Documentation\nDetails here.',
        sizeBytes: 30,
        included: true,
      },
    ]);

    expect(added.addedCount).toBe(2);
    expect(added.paths).toEqual(['src/main.ts', 'docs/README.md']);

    // Verify FileRecord in db.files
    const record = await getProjectFile(projectId, 'src/main.ts');
    expect(record).not.toBeNull();
    expect(record?.content).toBe('console.log("Hello, world!");');
    expect(record?.sizeBytes).toBe(29);

    // Verify FileRef in passport.files
    const passport = await getPassport(projectId);
    expect(passport?.files).toHaveLength(2);
    const mainRef = passport?.files.find((f) => f.path === 'src/main.ts');
    expect(mainRef).toBeDefined();
    expect(mainRef?.sizeBytes).toBe(29);
    expect(mainRef?.included).toBe(true);
    expect(Math.ceil((mainRef?.sizeBytes ?? 0) / 4)).toBe(8); // ceil(29 / 4)

    // Verify project updatedAt bumped
    const projectAfter = await getProject(projectId);
    expect(projectAfter?.updatedAt).not.toBe(projectBefore?.updatedAt);

    // Verify event dispatched
    expect(eventSpy).toHaveBeenCalled();
    window.removeEventListener('project-storage-updated', eventSpy);
  });

  it('stores no content in db.files when an item is excluded (included: false)', async () => {
    const project = await createProject('Excluded Files Project');
    const projectId = project.id;

    await addProjectFiles(projectId, [
      {
        path: 'src/excluded.ts',
        sizeBytes: 150,
        included: false,
      },
    ]);

    // Manifest row exists with included: false
    const passport = await getPassport(projectId);
    const ref = passport?.files.find((f) => f.path === 'src/excluded.ts');
    expect(ref).toBeDefined();
    expect(ref?.included).toBe(false);
    expect(ref?.sizeBytes).toBe(150);

    // No content stored in db.files
    const record = await getProjectFile(projectId, 'src/excluded.ts');
    expect(record).toBeNull();
  });

  it('defense in depth: rejects hard-blocked paths before saving', async () => {
    const project = await createProject('Security Invariant Project');
    const projectId = project.id;

    await expect(
      addProjectFiles(projectId, [
        {
          path: '.env',
          content: ['SEC', 'RET=dangerous'].join(''),
          sizeBytes: 16,
          included: true,
        },
      ])
    ).rejects.toThrow(ValidationFailed);

    await expect(
      addProjectFiles(projectId, [
        {
          path: 'config/server.key',
          content: 'KEY',
          sizeBytes: 3,
          included: true,
        },
      ])
    ).rejects.toThrow(ValidationFailed);

    // Confirm nothing was stored in db.files or passport.files
    const filesInDb = await db.files.where('projectId').equals(projectId).toArray();
    expect(filesInDb).toHaveLength(0);

    const passport = await getPassport(projectId);
    expect(passport?.files).toHaveLength(0);
  });

  it('updateProjectFileMeta updates purpose and included state across db.files and passport.files', async () => {
    const project = await createProject('Meta Update Project');
    const projectId = project.id;

    await addProjectFiles(projectId, [
      {
        path: 'src/utils.ts',
        content: 'export const add = (a: number, b: number) => a + b;',
        sizeBytes: 50,
        included: true,
      },
    ]);

    await updateProjectFileMeta(projectId, 'src/utils.ts', {
      purpose: 'Core math helper utilities',
      included: false,
    });

    // Check passport.files
    const passport = await getPassport(projectId);
    const fileRef = passport?.files.find((f) => f.path === 'src/utils.ts');
    expect(fileRef?.purpose).toBe('Core math helper utilities');
    expect(fileRef?.included).toBe(false);

    // Check db.files record content is still intact
    const record = await getProjectFile(projectId, 'src/utils.ts');
    expect(record?.content).toContain('export const add');
  });

  it('removeProjectFile and restoreProjectFile handle deletion and undo with exact identity', async () => {
    const project = await createProject('Removal Project');
    const projectId = project.id;

    await addProjectFiles(projectId, [
      {
        path: 'src/temp.ts',
        content: 'const x = 1;',
        sizeBytes: 12,
        included: true,
      },
    ]);

    // Remove file
    const removed = await removeProjectFile(projectId, 'src/temp.ts');
    expect(removed).not.toBeNull();
    expect(removed?.manifestRow.path).toBe('src/temp.ts');
    expect(removed?.fileRecord?.content).toBe('const x = 1;');

    // Verify absent
    expect(await getProjectFile(projectId, 'src/temp.ts')).toBeNull();
    const passportAfterRemove = await getPassport(projectId);
    expect(passportAfterRemove?.files.some((f) => f.path === 'src/temp.ts')).toBe(false);

    // Restore on undo
    if (removed) {
      await restoreProjectFile(projectId, removed);
    }

    // Verify restored with exact content
    const restoredRecord = await getProjectFile(projectId, 'src/temp.ts');
    expect(restoredRecord).not.toBeNull();
    expect(restoredRecord?.content).toBe('const x = 1;');
    const passportAfterRestore = await getPassport(projectId);
    expect(passportAfterRestore?.files.some((f) => f.path === 'src/temp.ts')).toBe(true);
  });

  it('acknowledgeFinding saves finding keys in FileRecord', async () => {
    const project = await createProject('Ack Project');
    const projectId = project.id;

    await addProjectFiles(projectId, [
      {
        path: 'src/sample.ts',
        content: ['const to', 'ken = "known-test-value";'].join(''),
        sizeBytes: 32,
        included: true,
      },
    ]);

    const findingKeySample = 'src/sample.ts:1:Credential Assignment:[CREDENTIAL:••••]';
    await acknowledgeFinding(projectId, 'src/sample.ts', findingKeySample);

    const record = await getProjectFile(projectId, 'src/sample.ts');
    expect(record?.acknowledgedFindings).toContain(findingKeySample);
  });

  it('enforces optimistic concurrency stale-write guards', async () => {
    const project = await createProject('Stale Write Project');
    const projectId = project.id;

    // Provide mismatched expectedUpdatedAt timestamp
    await expect(
      addProjectFiles(
        projectId,
        [
          {
            path: 'src/file.ts',
            content: 'data',
            sizeBytes: 4,
            included: true,
          },
        ],
        { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }
      )
    ).rejects.toThrow(StaleWrite);
  });

  it('rolls back atomically if an error occurs during transaction', async () => {
    await createProject('Rollback Project');

    // Attempt adding with an empty project id or invalid target to force rollback
    await expect(
      addProjectFiles('non-existent-project-id', [
        {
          path: 'src/test.ts',
          content: 'test',
          sizeBytes: 4,
          included: true,
        },
      ])
    ).rejects.toThrow();

    // Verify db.files has no orphaned records
    const files = await db.files.toArray();
    expect(files).toHaveLength(0);
  });
});
