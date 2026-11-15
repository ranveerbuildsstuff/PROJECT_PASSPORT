import { describe, it, expect } from 'vitest';
import { buildPackageArtifacts } from '../../src/export/packageBuilder';
import { handleExportWorkerMessage } from '../../src/export/export.worker';
import { planExport } from '../../src/export/budgeter';
import type { PassportV1 } from '../../src/domain/passport.schema';
import type { FileRecord } from '../../src/storage/db';

describe('packageBuilder & exportWorker', () => {
  const mockPassport: PassportV1 = {
    schemaVersion: 1,
    project: {
      id: 'proj-pkg-1',
      name: 'Package Test Project',
      goal: 'Verify zip packaging',
      summary: 'Package bundle builder tests',
      status: 'in_progress',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    stack: [{ name: 'Vite', role: 'Bundler' }],
    requirements: [{ id: 'r1', text: 'Build valid zip', priority: 'must' }],
    decisions: [{ id: 'd1', decision: 'Use JSZip', reason: 'Pure client-side', status: 'active' }],
    completed: [],
    tasks: [{ id: 't1', text: 'Test manifest hashing', status: 'todo', priority: 'medium' }],
    bugs: [],
    bugsReviewed: true,
    instructions: [],
    files: [
      { path: 'src/index.ts', purpose: 'Entry', included: true, sizeBytes: 25 },
      { path: '.env', purpose: 'Accidental secret file in manifest', included: true, sizeBytes: 20 },
    ],
    conversations: [
      { id: 'conv-1', title: 'Design Chat', source: 'claude', messageCount: 1, tokenEstimate: 20, included: true },
    ],
    nextAction: 'Verify package integrity',
    openQuestions: [],
  };

  const fileRecords: FileRecord[] = [
    {
      id: 'proj-pkg-1:src/index.ts',
      projectId: 'proj-pkg-1',
      path: 'src/index.ts',
      content: 'console.log("hello world");',
      sizeBytes: 27,
      mime: 'text/plain',
      acknowledgedFindings: [],
    },
    {
      id: 'proj-pkg-1:.env',
      projectId: 'proj-pkg-1',
      path: '.env',
      content: 'SECRET_KEY=12345',
      sizeBytes: 16,
      mime: 'text/plain',
      acknowledgedFindings: [],
    },
  ];

  it('builds package artifacts and manifest with deterministic byte identity', async () => {
    const plan = planExport(
      {
        passport: mockPassport,
        files: fileRecords,
        conversations: [
          {
            record: {
              id: 'conv-1',
              projectId: 'proj-pkg-1',
              title: 'Design Chat',
              source: 'claude',
              messages: [],
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            turns: [{ id: 't1', role: 'user', text: 'How to structure zip?' }],
          },
        ],
      },
      40_000
    );

    const { files, manifest, manifestJson } = await buildPackageArtifacts(plan);

    // Verify required files are present
    const paths = files.map((f) => f.path);
    expect(paths).toContain('project-passport.json');
    expect(paths).toContain('PROJECT_STATE.md');
    expect(paths).toContain('CONTINUE_PROMPT.md');
    expect(paths).toContain('MANIFEST.json');
    expect(paths).toContain('files/src/index.ts');
    expect(paths).toContain('conversations/conv-1-design-chat.md');

    // Security invariant: Hard-blocked .env NEVER appears in the package!
    expect(paths).not.toContain('files/.env');
    expect(paths).not.toContain('.env');

    // Verify manifest metadata
    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.projectId).toBe('proj-pkg-1');
    expect(manifest.projectName).toBe('Package Test Project');
    expect(manifest.entries.length).toBeGreaterThan(0);

    // Verify manifest contains no timestamps
    expect(manifestJson).not.toContain('"timestamp"');
    expect(manifestJson).not.toContain('"createdAt"');
    expect(manifestJson).not.toContain('"generatedAt"');

    // Verify reproducible bytes on second build
    const secondBuild = await buildPackageArtifacts(plan);
    expect(secondBuild.manifestJson).toBe(manifestJson);
  });

  it('generates a valid zip via export worker handler', async () => {
    const plan = planExport(
      {
        passport: mockPassport,
        files: fileRecords,
      },
      30_000
    );

    const result = await handleExportWorkerMessage({
      action: 'build_zip',
      plan,
    });

    expect(result.type).toBe('zip_success');
    if (result.type === 'zip_success') {
      expect(result.buffer).toBeInstanceOf(ArrayBuffer);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.filename).toBe('package-test-project-passport.zip');
    }
  });
});
