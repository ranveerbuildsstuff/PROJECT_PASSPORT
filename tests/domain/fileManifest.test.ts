import { describe, it, expect } from 'vitest';
import {
  buildFileManifestRow,
  unresolvedFindings,
  type FileItemWithFindings,
} from '../../src/domain/fileManifest';
import { formatTokenEstimate } from '../../src/domain/tokens';
import { type SecretFinding, findingKey } from '../../src/domain/secretScanner';

describe('fileManifest domain module', () => {
  it('builds a manifest row with token estimate', () => {
    const row = buildFileManifestRow('src/index.ts', 400, 'Main entrypoint', true);
    expect(row.path).toBe('src/index.ts');
    expect(row.purpose).toBe('Main entrypoint');
    expect(row.sizeBytes).toBe(400);
    expect(row.included).toBe(true);
    expect(row.tokenEstimate).toBe(100);
  });

  it('formats token estimate according to exact string requirement', () => {
    expect(formatTokenEstimate(250)).toBe('~250 tokens (estimate)');
    expect(formatTokenEstimate(1500)).toBe('~1,500 tokens (estimate)');
  });

  it('unresolvedFindings returns only unacknowledged findings', () => {
    const finding1: SecretFinding = {
      path: 'src/config.ts',
      line: 5,
      category: 'AWS Access Key',
      masked: 'AKIAIO...MPLE',
    };
    const finding2: SecretFinding = {
      path: 'src/auth.ts',
      line: 12,
      category: 'GitHub Token',
      masked: 'ghp_12...wxyz',
    };

    const key1 = findingKey(finding1);

    const files: FileItemWithFindings[] = [
      {
        path: 'src/config.ts',
        findings: [finding1],
        acknowledgedKeys: [key1], // acknowledged
      },
      {
        path: 'src/auth.ts',
        findings: [finding2],
        acknowledgedKeys: [], // unacknowledged
      },
    ];

    const unresolved = unresolvedFindings(files);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toEqual(finding2);
  });
});
