import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { scanText, type SecretFinding } from '../../src/domain/secretScanner';

function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        getAllSourceFiles(fullPath, fileList);
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html'].includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

describe('Repository Secret Hygiene', () => {
  it('scans all committed src/, tests/, and e2e/ files with the app secret scanner and finds zero secrets', () => {
    const rootDir = process.cwd();
    const targetDirs = ['src', 'tests', 'e2e'].map((d) => path.join(rootDir, d));
    const allFiles = targetDirs.flatMap((d) => getAllSourceFiles(d));

    const allFindings: Array<{ file: string; findings: SecretFinding[] }> = [];

    for (const filePath of allFiles) {
      // Skip this test file itself to avoid any self-referential false alarms
      if (filePath.endsWith('repoHygiene.test.ts')) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const findings = scanText(content, relPath);

      if (findings.length > 0) {
        allFindings.push({ file: relPath, findings });
      }
    }

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
