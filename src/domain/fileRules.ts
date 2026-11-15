/**
 * Pure, deterministic rules for file path normalization, hard security blocks,
 * and ignore filtering.
 */

export const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB

export const DEFAULT_IGNORE_DIRECTORIES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.venv',
  '__pycache__',
];

export const DEFAULT_IGNORE_LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'composer.lock',
  'Gemfile.lock',
  'Cargo.lock',
];

export const DEFAULT_IGNORE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.svg',
  '.mp4',
  '.mp3',
  '.wav',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.wasm',
  '.pyc',
  '.class',
  '.jar',
  '.iso',
  '.dmg',
];

export const DEFAULT_IGNORE_LIST: string[] = [
  ...DEFAULT_IGNORE_DIRECTORIES,
  ...DEFAULT_IGNORE_LOCKFILES,
  ...DEFAULT_IGNORE_EXTENSIONS,
];

/**
 * Normalizes a file path:
 * - Converts backslashes to forward slashes
 * - Strips leading `./`
 * - Collapses consecutive slashes
 * - Rejects empty paths, absolute paths, and any `..` segment (zip-slip defense)
 */
export function normalizeFilePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('File path cannot be empty.');
  }

  let p = rawPath.replace(/\\/g, '/').trim();

  // Strip leading ./
  while (p.startsWith('./')) {
    p = p.slice(2);
  }

  if (!p || p === '.') {
    throw new Error('File path cannot be empty.');
  }

  // Reject absolute paths (UNIX root or Windows drive letter)
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) {
    throw new Error(`Absolute paths are not allowed: ${rawPath}`);
  }

  // Split and inspect segments
  const segments = p.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      throw new Error(`Path traversal (..) is not allowed: ${rawPath}`);
    }
  }

  // Filter out any empty segments (e.g. from consecutive slashes)
  const cleanSegments = segments.filter((s) => s.length > 0 && s !== '.');
  if (cleanSegments.length === 0) {
    throw new Error('File path cannot be empty.');
  }

  return cleanSegments.join('/');
}

/**
 * Security Invariant: Hard-blocked files.
 * Matches purely on the file name, case-insensitive:
 * - `.env` and `.env.*`
 * - `*.pem`
 * - `*.key`
 * - `id_rsa*`
 * - `*service-account*.json`
 * - `*credentials*.json`
 *
 * Never requires file content.
 */
export function isHardBlocked(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;

  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.split('/').pop()?.toLowerCase() ?? '';
  if (!basename) return false;

  // .env and .env.*
  if (basename === '.env' || basename.startsWith('.env.')) {
    return true;
  }

  // *.pem
  if (basename.endsWith('.pem')) {
    return true;
  }

  // *.key
  if (basename.endsWith('.key')) {
    return true;
  }

  // id_rsa*
  if (basename.startsWith('id_rsa')) {
    return true;
  }

  // *service-account*.json
  if (basename.includes('service-account') && basename.endsWith('.json')) {
    return true;
  }

  // *credentials*.json
  if (basename.includes('credentials') && basename.endsWith('.json')) {
    return true;
  }

  return false;
}

export interface ShouldIgnoreResult {
  ignore: boolean;
  reason?: string;
}

/**
 * Pure check deciding whether a file should be ignored.
 * Checks file size against the 500 KB boundary and the active ignore list.
 */
export function shouldIgnore(
  filePath: string,
  sizeBytes: number,
  ignoreList: string[] = DEFAULT_IGNORE_LIST
): ShouldIgnoreResult {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      ignore: true,
      reason: 'File exceeds 500 KB limit',
    };
  }

  let normalized = filePath.replace(/\\/g, '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  const segments = normalized.split('/').map((s) => s.toLowerCase());
  const basename = segments[segments.length - 1] ?? '';
  const ext = basename.includes('.') ? `.${basename.split('.').pop()}` : '';

  for (const item of ignoreList) {
    let pattern = item.trim().toLowerCase();
    if (!pattern) continue;

    // Strip trailing slash: 'temp/' -> 'temp'
    pattern = pattern.replace(/\/+$/, '');

    // Wildcard extension: '*.backup' -> '.backup'
    if (pattern.startsWith('*.')) {
      pattern = pattern.slice(1);
    }

    // Pattern is an extension (e.g. .png, .zip, .backup)
    if (pattern.startsWith('.')) {
      if (ext === pattern || basename.endsWith(pattern)) {
        return {
          ignore: true,
          reason: `Matches ignored extension: ${item}`,
        };
      }
    }

    // Pattern matches a directory segment (e.g. node_modules, .git, temp)
    if (segments.slice(0, -1).includes(pattern)) {
      return {
        ignore: true,
        reason: `Inside ignored directory: ${item}`,
      };
    }

    // Pattern matches the exact basename or segment (e.g. package-lock.json)
    if (basename === pattern || segments.includes(pattern)) {
      return {
        ignore: true,
        reason: `Matches ignored pattern: ${item}`,
      };
    }
  }

  return { ignore: false };
}
