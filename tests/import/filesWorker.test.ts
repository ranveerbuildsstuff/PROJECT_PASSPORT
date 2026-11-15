import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  handleFilesWorkerMessage,
  type FilesWorkerState,
  type FilesWorkerIncomingMessage,
} from '../../src/import/files.worker';
import { findingKey } from '../../src/domain/secretScanner';

describe('files.worker handleFilesWorkerMessage', () => {
  it('scans loose files and flags secrets', async () => {
    const state: FilesWorkerState = {
      stagedFiles: new Map(),
      hardBlockedPaths: [],
      ignoredFiles: [],
      allFindings: [],
    };

    const message: FilesWorkerIncomingMessage = {
      action: 'scan',
      files: [
        {
          name: 'app.ts',
          path: 'src/app.ts',
          text: 'const key = "AKIAIOSFODNN7EXAMPLE";',
        },
        {
          name: '.env',
          path: '.env',
          text: 'SHOULD_NEVER_BE_READ=1',
        },
        {
          name: 'large.txt',
          path: 'large.txt',
          size: 600 * 1024,
          text: 'x'.repeat(600 * 1024),
        },
      ],
    };

    const { response } = await handleFilesWorkerMessage(state, message);

    expect(response.type).toBe('scan_result');
    if (response.type === 'scan_result' && response.result.ok) {
      // app.ts is included with 1 finding
      expect(response.result.included).toHaveLength(1);
      expect(response.result.included[0]?.path).toBe('src/app.ts');
      expect(response.result.findings).toHaveLength(1);
      expect(response.result.findings[0]?.category).toBe('AWS Access Key');

      // .env is hard-blocked by path
      expect(response.result.hardBlocked).toContain('.env');

      // large.txt is ignored (> 500 KB)
      expect(response.result.ignored.some((i) => i.path === 'large.txt')).toBe(true);
    }
  });

  it('handles zip archives safely: rejects zip-slip paths before decompression', async () => {
    const zip = new JSZip();
    zip.file('safe_file_entry.txt', 'root:x:0:0:root:/root:/bin/bash');
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    // Patch binary zip buffer to contain real traversal path (JSZip API sanitizes strings at authoring time)
    const bytes = new Uint8Array(zipBuffer);
    const target = new TextEncoder().encode('safe_file_entry.txt');
    const replacement = new TextEncoder().encode('../unsafe/file.txt');
    for (let i = 0; i <= bytes.length - target.length; i++) {
      let match = true;
      for (let j = 0; j < target.length; j++) {
        if (bytes[i + j] !== target[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        bytes.set(replacement, i);
      }
    }

    const state: FilesWorkerState = {
      stagedFiles: new Map(),
      hardBlockedPaths: [],
      ignoredFiles: [],
      allFindings: [],
    };

    const message: FilesWorkerIncomingMessage = {
      action: 'scan',
      files: [
        {
          name: 'malicious.zip',
          isZip: true,
          file: new Blob([bytes], { type: 'application/zip' }),
        },
      ],
    };

    const { response } = await handleFilesWorkerMessage(state, message);

    expect(response.type).toBe('scan_result');
    if (response.type === 'scan_result') {
      expect(response.result.ok).toBe(false);
      if (!response.result.ok) {
        expect(response.result.code).toBe('unsafe_zip');
        expect(response.result.message).toContain("can't use safely");
      }
    }
  });

  it('rejects hard-blocked files in zip before decompressing them', async () => {
    const zip = new JSZip();
    zip.file('.env.production', 'DATABASE_URL=postgres://secret');
    zip.file('src/index.ts', 'console.log("hello");');
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const state: FilesWorkerState = {
      stagedFiles: new Map(),
      hardBlockedPaths: [],
      ignoredFiles: [],
      allFindings: [],
    };

    const message: FilesWorkerIncomingMessage = {
      action: 'scan',
      files: [
        {
          name: 'project.zip',
          isZip: true,
          file: new Blob([zipBuffer], { type: 'application/zip' }),
        },
      ],
    };

    const { response } = await handleFilesWorkerMessage(state, message);

    expect(response.type).toBe('scan_result');
    if (response.type === 'scan_result' && response.result.ok) {
      expect(response.result.hardBlocked).toContain('.env.production');
      expect(response.result.included.map((f) => f.path)).toEqual(['src/index.ts']);
    }
  });

  it('commits user choices: Redact scrubs content, Exclude sets included=false and removes content', async () => {
    // Setup state with 2 files and 2 findings
    let state: FilesWorkerState = {
      stagedFiles: new Map(),
      hardBlockedPaths: [],
      ignoredFiles: [],
      allFindings: [],
    };

    const scanMsg: FilesWorkerIncomingMessage = {
      action: 'scan',
      files: [
        {
          name: 'fileA.ts',
          path: 'src/fileA.ts',
          text: 'const aws = "AKIAIOSFODNN7EXAMPLE";',
        },
        {
          name: 'fileB.ts',
          path: 'src/fileB.ts',
          text: 'const key = "AIzaSyD-1234567890abcdefghijklmnopqrst";',
        },
      ],
    };

    const scanRes = await handleFilesWorkerMessage(state, scanMsg);
    state = scanRes.nextState;

    if (scanRes.response.type === 'scan_result' && scanRes.response.result.ok) {
      const findings = scanRes.response.result.findings;
      const findingA = findings.find((f) => f.path === 'src/fileA.ts')!;

      // User choices: Redact findingA, Exclude fileB
      const commitMsg: FilesWorkerIncomingMessage = {
        action: 'commit',
        redactions: [findingA],
        excludedPaths: ['src/fileB.ts'],
        acknowledgedKeys: [],
      };

      const commitRes = await handleFilesWorkerMessage(state, commitMsg);
      expect(commitRes.response.type).toBe('commit_result');
      if (commitRes.response.type === 'commit_result') {
        const fileA = commitRes.response.files.find((f) => f.path === 'src/fileA.ts');
        const fileB = commitRes.response.files.find((f) => f.path === 'src/fileB.ts');

        // File A is redacted
        expect(fileA?.included).toBe(true);
        expect(fileA?.content).toContain('const aws = "[REDACTED]";');
        expect(fileA?.content).not.toContain('AKIAIOSFODNN7EXAMPLE');

        // File B is excluded: included=false, NO content stored
        expect(fileB?.included).toBe(false);
        expect(fileB?.content).toBeUndefined();
      }
    }
  });

  it('acknowledges false positive findings and associates keys', async () => {
    let state: FilesWorkerState = {
      stagedFiles: new Map(),
      hardBlockedPaths: [],
      ignoredFiles: [],
      allFindings: [],
    };

    const scanMsg: FilesWorkerIncomingMessage = {
      action: 'scan',
      files: [
        {
          name: 'doc.ts',
          path: 'src/doc.ts',
          text: 'const demo = "AKIAIOSFODNN7EXAMPLE";',
        },
      ],
    };

    const scanRes = await handleFilesWorkerMessage(state, scanMsg);
    state = scanRes.nextState;

    if (scanRes.response.type === 'scan_result' && scanRes.response.result.ok) {
      const finding = scanRes.response.result.findings[0]!;
      const key = findingKey(finding);

      const commitMsg: FilesWorkerIncomingMessage = {
        action: 'commit',
        redactions: [],
        excludedPaths: [],
        acknowledgedKeys: [key],
      };

      const commitRes = await handleFilesWorkerMessage(state, commitMsg);
      expect(commitRes.response.type).toBe('commit_result');
      if (commitRes.response.type === 'commit_result') {
        const file = commitRes.response.files[0];
        expect(file?.included).toBe(true);
        expect(file?.acknowledgedFindings).toContain(key);
      }
    }
  });

  it('handles clear and returns cleared response', async () => {
    const state: FilesWorkerState = {
      stagedFiles: new Map(),
      hardBlockedPaths: ['foo'],
      ignoredFiles: [],
      allFindings: [],
    };
    const { nextState, response } = await handleFilesWorkerMessage(state, { action: 'clear' });
    expect(response.type).toBe('cleared');
    expect(nextState.hardBlockedPaths).toHaveLength(0);
  });
});
