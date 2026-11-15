import { describe, it, expect } from 'vitest';
import {
  normalizeFilePath,
  isHardBlocked,
  shouldIgnore,
  DEFAULT_IGNORE_LIST,
  MAX_FILE_SIZE_BYTES,
} from '../../src/domain/fileRules';

describe('fileRules domain module', () => {
  describe('normalizeFilePath', () => {
    it('normalizes backslashes to forward slashes', () => {
      expect(normalizeFilePath('src\\domain\\fileRules.ts')).toBe('src/domain/fileRules.ts');
    });

    it('strips leading ./ segments', () => {
      expect(normalizeFilePath('./src/index.ts')).toBe('src/index.ts');
      expect(normalizeFilePath('././nested/file.txt')).toBe('nested/file.txt');
    });

    it('collapses multiple slashes', () => {
      expect(normalizeFilePath('src//utils///helpers.ts')).toBe('src/utils/helpers.ts');
    });

    it('rejects empty paths or whitespace only', () => {
      expect(() => normalizeFilePath('')).toThrow('File path cannot be empty');
      expect(() => normalizeFilePath('   ')).toThrow('File path cannot be empty');
      expect(() => normalizeFilePath('.')).toThrow('File path cannot be empty');
    });

    it('rejects absolute UNIX paths', () => {
      expect(() => normalizeFilePath('/etc/passwd')).toThrow('Absolute paths are not allowed');
    });

    it('rejects absolute Windows paths', () => {
      expect(() => normalizeFilePath('C:\\Windows\\System32')).toThrow('Absolute paths are not allowed');
      expect(() => normalizeFilePath('D:/projects/repo')).toThrow('Absolute paths are not allowed');
    });

    it('rejects path traversal with .. (zip-slip defense)', () => {
      expect(() => normalizeFilePath('../secret.txt')).toThrow('Path traversal (..) is not allowed');
      expect(() => normalizeFilePath('src/../../etc/shadow')).toThrow('Path traversal (..) is not allowed');
      expect(() => normalizeFilePath('dir/..')).toThrow('Path traversal (..) is not allowed');
    });
  });

  describe('isHardBlocked (Security Invariant Table - at least 25 paths)', () => {
    const hardBlockedCases = [
      // .env and .env.*
      '.env',
      '.ENV',
      '.env.local',
      '.env.production',
      '.env.development.local',
      'deep/nested/config/.env',
      'frontend/.env.staging',
      // *.pem
      'cert.pem',
      'server.PEM',
      'keys/tls/bundle.pem',
      'config/ca.pem',
      // *.key
      'private.key',
      'SERVER.KEY',
      'ssl/domain.key',
      'auth/secret.key',
      // id_rsa*
      'id_rsa',
      'id_rsa.pub',
      'ID_RSA_BACKUP',
      'home/.ssh/id_rsa',
      'ssh/id_rsa_deploy',
      // *service-account*.json
      'firebase-service-account.json',
      'SERVICE-ACCOUNT-KEY.JSON',
      'gcp/google-service-account-prod.json',
      'keys/service-account.json',
      // *credentials*.json
      'credentials.json',
      'GOOGLE_CREDENTIALS.JSON',
      'auth/client-credentials.json',
      'config/aws_credentials.json',
    ];

    const allowedNearMisses = [
      'environment.ts',
      'ENVIRONMENT.MD',
      'keyboard.ts',
      'key.ts',
      'my-key-file.ts',
      'pem-parser.ts',
      'credentials-guide.md',
      'service-account.ts',
      'service-account-docs.html',
      'credentials.xml',
      'not_id_rsa.txt',
      'config.env.ts',
      'dotenv.js',
    ];

    it.each(hardBlockedCases)('blocks prohibited path: %s', (path) => {
      expect(isHardBlocked(path)).toBe(true);
    });

    it.each(allowedNearMisses)('does NOT block near-miss path: %s', (path) => {
      expect(isHardBlocked(path)).toBe(false);
    });
  });

  describe('shouldIgnore', () => {
    it('ignores standard directories', () => {
      expect(shouldIgnore('node_modules/lodash/index.js', 100).ignore).toBe(true);
      expect(shouldIgnore('.git/config', 50).ignore).toBe(true);
      expect(shouldIgnore('dist/bundle.js', 200).ignore).toBe(true);
      expect(shouldIgnore('build/output.js', 200).ignore).toBe(true);
      expect(shouldIgnore('.next/static/chunks/app.js', 150).ignore).toBe(true);
      expect(shouldIgnore('.venv/lib/python3.10/site.py', 100).ignore).toBe(true);
      expect(shouldIgnore('src/__pycache__/mod.cpython-310.pyc', 50).ignore).toBe(true);
    });

    it('ignores lockfiles', () => {
      expect(shouldIgnore('package-lock.json', 1000).ignore).toBe(true);
      expect(shouldIgnore('pnpm-lock.yaml', 1000).ignore).toBe(true);
      expect(shouldIgnore('yarn.lock', 1000).ignore).toBe(true);
      expect(shouldIgnore('Cargo.lock', 1000).ignore).toBe(true);
      expect(shouldIgnore('composer.lock', 1000).ignore).toBe(true);
    });

    it('ignores media and binary extensions', () => {
      expect(shouldIgnore('assets/logo.png', 1000).ignore).toBe(true);
      expect(shouldIgnore('images/hero.jpg', 2000).ignore).toBe(true);
      expect(shouldIgnore('docs/manual.pdf', 3000).ignore).toBe(true);
      expect(shouldIgnore('archive.zip', 4000).ignore).toBe(true);
      expect(shouldIgnore('fonts/inter.woff2', 500).ignore).toBe(true);
      expect(shouldIgnore('native/lib.dll', 500).ignore).toBe(true);
    });

    it('respects the 500 KB boundary exactly', () => {
      // Exactly 500 KB passes
      expect(shouldIgnore('src/large-data.json', MAX_FILE_SIZE_BYTES).ignore).toBe(false);

      // 500 KB + 1 byte is ignored
      const overResult = shouldIgnore('src/large-data.json', MAX_FILE_SIZE_BYTES + 1);
      expect(overResult.ignore).toBe(true);
      expect(overResult.reason).toContain('500 KB');
    });

    it('supports user-edited session ignore lists', () => {
      const customList = [...DEFAULT_IGNORE_LIST, 'temp/', '*.backup', 'coverage'];

      expect(shouldIgnore('temp/cache.json', 100, customList).ignore).toBe(true);
      expect(shouldIgnore('coverage/lcov.info', 100, customList).ignore).toBe(true);
      expect(shouldIgnore('src/file.backup', 100, customList).ignore).toBe(true);

      // Normal source file still passes
      expect(shouldIgnore('src/app.tsx', 2000, customList).ignore).toBe(false);
    });
  });
});
