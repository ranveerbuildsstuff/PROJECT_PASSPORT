import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { scanText } from '../../src/domain/secretScanner';

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  'coverage',
  'test-results',
  'playwright-report',
  'e2e-results',
  '.turbo',
  '.cache',
  '.vite',
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        getAllSourceFiles(fullPath, fileList);
      }
    } else {
      if (IGNORED_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html'].includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

describe('Repository Secret Hygiene', () => {
  it('scans all committed src/, tests/, and e2e/ files with the app secret scanner and finds zero secrets', async () => {
    const rootDir = process.cwd();
    const targetDirs = ['src', 'tests', 'e2e'].map((d) => path.join(rootDir, d));
    const allFiles = targetDirs.flatMap((d) => getAllSourceFiles(d));

    // Filter out this test file itself to avoid any self-referential false alarms
    const filesToScan = allFiles.filter((filePath) => !filePath.endsWith('repoHygiene.test.ts'));

    const fileResults = await Promise.all(
      filesToScan.map(async (filePath) => {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
        const findings = scanText(content, relPath);
        return { file: relPath, findings };
      })
    );

    const allFindings = fileResults.filter((r) => r.findings.length > 0);

    if (allFindings.length > 0) {
      const summary = allFindings
        .map(
          (f) =>
            `${f.file}:\n` +
            f.findings.map((finding) => `  line ${finding.line}: [${finding.category}] ${finding.masked}`).join('\n')
        )
        .join('\n\n');
      expect.fail(`Repo hygiene scan found ${allFindings.length} files with secret-shaped literals:\n\n${summary}`);
    }

    expect(allFindings).toHaveLength(0);
  });
});
