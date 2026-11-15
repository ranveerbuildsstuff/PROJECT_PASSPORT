import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import { parsePackageZip } from '../../src/import/packageImport';
import { planExport } from '../../src/export/budgeter';
import { handleExportWorkerMessage } from '../../src/export/export.worker';
import { db } from '../../src/storage/db';
import { importPackage, createProject, getPassport, getProject } from '../../src/storage/storageService';
import type { PassportV1 } from '../../src/domain/passport.schema';
import type { FileRecord } from '../../src/storage/db';
import { FIXED_ZIP_DATE } from '../../src/export/export.worker';

describe('packageImport & storage round-trip', () => {
  beforeEach(async () => {
    await db.projects.clear();
    await db.passports.clear();
    await db.checkpoints.clear();
    await db.conversations.clear();
    await db.files.clear();
  });

  const basePassport: PassportV1 = {
    schemaVersion: 1,
    project: {
      id: 'proj-roundtrip-1',
      name: 'Roundtrip Project',
      goal: 'Verify export and import roundtrip',
      summary: 'Roundtrip fidelity tests',
      status: 'in_progress',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    stack: [{ name: 'TypeScript', role: 'Language' }],
    requirements: [{ id: 'r1', text: 'Must roundtrip cleanly', priority: 'must' }],
    decisions: [{ id: 'd1', decision: 'Export full zip', reason: 'Cross-machine mobility', status: 'active' }],
    completed: [{ id: 'c1', text: 'Define zip schema' }],
    tasks: [{ id: 't1', text: 'Write package import tests', status: 'todo', priority: 'high' }],
    bugs: [{ id: 'b1', text: 'Minor spacing bug', severity: 'low', status: 'open' }],
    bugsReviewed: true,
    instructions: ['Always verify hashes before importing'],
    files: [
      { path: 'src/main.ts', purpose: 'Entry point', included: true, sizeBytes: 27 },
    ],
    conversations: [
      { id: 'conv-rt', title: 'Roundtrip Chat', source: 'claude', messageCount: 2, tokenEstimate: 50, included: true },
    ],
    nextAction: 'Verify database restoration',
    openQuestions: ['Should we support .tar?'],
  };

  const fileRecords: FileRecord[] = [
    {
      id: 'proj-roundtrip-1:src/main.ts',
      projectId: 'proj-roundtrip-1',
      path: 'src/main.ts',
      content: 'console.log("hello world");',
      sizeBytes: 27,
      mime: 'text/plain',
      acknowledgedFindings: [],
    },
  ];

  it('exports a full package zip and imports it back with identical passport data', async () => {
    const plan = planExport(
      {
        passport: basePassport,
        files: fileRecords,
        conversations: [
          {
            record: {
              id: 'conv-rt',
              projectId: 'proj-roundtrip-1',
              title: 'Roundtrip Chat',
              source: 'claude',
              messages: [],
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            turns: [
              { id: 't1', role: 'user', text: 'Let us test import.' },
              { id: 't2', role: 'assistant', text: 'Import is verified.' },
            ],
          },
        ],
      },
      50_000
    );

    const workerResult = await handleExportWorkerMessage({ action: 'build_zip', plan });
    expect(workerResult.type).toBe('zip_success');
    if (workerResult.type !== 'zip_success') return;

    // Parse the zip
    const importResult = await parsePackageZip(workerResult.buffer);
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) return;

    expect(importResult.passport.project.id).toBe(basePassport.project.id);
    expect(importResult.passport.project.name).toBe(basePassport.project.name);
    expect(importResult.passport.requirements).toEqual(basePassport.requirements);
    expect(importResult.passport.decisions).toEqual(basePassport.decisions);
    expect(importResult.passport.tasks).toEqual(basePassport.tasks);
    expect(importResult.files).toHaveLength(1);
    expect(importResult.files[0]!.content).toBe('console.log("hello world");');
    expect(importResult.conversations).toHaveLength(1);
    expect(importResult.conversations[0]!.turns).toHaveLength(2);

    // Now import into storage
    const targetId = await importPackage(importResult);
    expect(targetId).toBe(basePassport.project.id);

    const storedPassport = await getPassport(targetId);
    expect(storedPassport).toBeDefined();
    expect(storedPassport!.project.name).toBe(basePassport.project.name);
  });

  it('rejects zip when MANIFEST.json is missing', async () => {
    const zip = new JSZip();
    zip.file('project-passport.json', JSON.stringify(basePassport));
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await parsePackageZip(buffer);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('manifest_missing');
      expect(result.message).toContain('missing MANIFEST.json');
    }
  });

  it('rejects zip when a file is tampered with (SHA-256 mismatch)', async () => {
    const plan = planExport({ passport: basePassport, files: fileRecords }, 30_000);
    const workerResult = await handleExportWorkerMessage({ action: 'build_zip', plan });
    if (workerResult.type !== 'zip_success') return;

    // Tamper with files/src/main.ts inside the zip
    const zip = await JSZip.loadAsync(workerResult.buffer);
    zip.file('files/src/main.ts', 'console.log("TAMPERED CONTENT");', { date: FIXED_ZIP_DATE });
    const tamperedBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await parsePackageZip(tamperedBuffer);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('integrity_mismatch');
      expect(result.message).toContain('SHA-256 hash mismatch for "files/src/main.ts"');
    }
  });

  it('handles same-ID conflict: "copy" creates a new project ID and appends (Copy)', async () => {
    // Pre-create project in storage with same ID
    await createProject('Pre-existing Project');

    const plan = planExport({ passport: basePassport, files: fileRecords }, 30_000);
    const workerResult = await handleExportWorkerMessage({ action: 'build_zip', plan });
    if (workerResult.type !== 'zip_success') return;

    const parsed = await parsePackageZip(workerResult.buffer);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Set imported passport ID to match existing project
    const existing = (await db.projects.toArray())[0]!;
    parsed.passport.project.id = existing.id;

    // Import as copy
    const copyId = await importPackage(parsed, { conflictAction: 'copy' });
    expect(copyId).not.toBe(existing.id);

    const copyProj = await getProject(copyId);
    expect(copyProj?.name).toContain('(Copy)');

    // Pre-existing project remains untouched
    const originalProj = await getProject(existing.id);
    expect(originalProj?.name).toBe('Pre-existing Project');
  });

  it('handles same-ID conflict: "replace" overwrites existing project data atomically', async () => {
    const existing = await createProject('Old Project To Replace');

    const plan = planExport({ passport: basePassport, files: fileRecords }, 30_000);
    const workerResult = await handleExportWorkerMessage({ action: 'build_zip', plan });
    if (workerResult.type !== 'zip_success') return;

    const parsed = await parsePackageZip(workerResult.buffer);
    if (!parsed.ok) return;

    parsed.passport.project.id = existing.id;

    const replacedId = await importPackage(parsed, { conflictAction: 'replace' });
    expect(replacedId).toBe(existing.id);

    const replacedPassport = await getPassport(existing.id);
    expect(replacedPassport?.project.name).toBe(basePassport.project.name);
  });
});
