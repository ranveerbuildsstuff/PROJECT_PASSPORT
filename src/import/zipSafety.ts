/**
 * Shared zip safety validation and security invariants.
 *
 * Invariants:
 * - Maximum 500 entries per archive.
 * - Maximum 20 MB total uncompressed size.
 * - Raw path traversal detection before JSZip sanitizes it (rejects .., absolute paths, drive letters).
 * - Hard-blocked files (.env*, *.key, *.pem, id_rsa*, *service-account*.json, *credentials*.json) checked by path.
 * - Plain-language human error messages with actionable steps.
 */

import { normalizeFilePath, isHardBlocked } from '../domain/fileRules';

export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_ZIP_SINGLE_FILE_BYTES = 500 * 1024; // 500 KB

export const UNSAFE_ZIP_ERROR_MESSAGE =
  "This .zip contains paths we can't use safely. Unzip it yourself and choose the folder instead.";

export const ZIP_TOO_LARGE_ERROR_MESSAGE =
  'This .zip expands to more than the app can handle safely. Choose a smaller folder or archive.';

export const ZIP_PARSE_ERROR_MESSAGE = 'Could not read the .zip archive.';

/**
 * Checks whether a raw zip entry name contains path traversal or absolute components.
 */
export function isUnsafeZipPath(name: string): boolean {
  const normalized = name.replace(/\\/g, '/');
  return (
    normalized.includes('../') ||
    normalized.endsWith('/..') ||
    normalized === '..' ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(name)
  );
}

/**
 * Creates a decoder function for JSZip.loadAsync that tracks path traversals in raw entry names.
 */
export function createZipNameDecoder(onTraversalDetected: () => void): (bytes: string[] | Uint8Array | Buffer) => string {
  return (bytes: string[] | Uint8Array | Buffer): string => {
    let name: string;
    try {
      if (bytes instanceof Uint8Array) {
        name = new TextDecoder('utf-8').decode(bytes);
      } else if (Array.isArray(bytes)) {
        name = bytes.map((b) => (typeof b === 'number' ? String.fromCharCode(b) : String(b))).join('');
      } else {
        name = String(bytes);
      }
    } catch {
      name = String(bytes);
    }

    if (isUnsafeZipPath(name)) {
      onTraversalDetected();
    }

    return name;
  };
}

export type ZipValidationResult =
  | { ok: true; totalUncompressedBytes: number }
  | { ok: false; code: 'unsafe_zip' | 'zip_too_large'; message: string };

/**
 * Validates zip entries against size and security invariants.
 */
export function validateZipEntries(
  entries: Array<{ name: string; dir: boolean; _data?: { uncompressedSize?: number } }>
): ZipValidationResult {
  if (entries.length > MAX_ZIP_ENTRIES) {
    return {
      ok: false,
      code: 'zip_too_large',
      message: ZIP_TOO_LARGE_ERROR_MESSAGE,
    };
  }

  let totalUncompressed = 0;

  for (const entry of entries) {
    if (entry.dir) continue;

    let normalized: string;
    try {
      normalized = normalizeFilePath(entry.name);
    } catch {
      return {
        ok: false,
        code: 'unsafe_zip',
        message: UNSAFE_ZIP_ERROR_MESSAGE,
      };
    }

    // Check hard-blocked files by path
    if (isHardBlocked(normalized)) {
      return {
        ok: false,
        code: 'unsafe_zip',
        message: `This .zip contains hard-blocked security files (${normalized}). Remove them and try again.`,
      };
    }

    // Check uncompressed size
    const declaredSize = (entry._data as { uncompressedSize?: number } | undefined)?.uncompressedSize ?? 0;
    totalUncompressed += declaredSize;

    if (totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      return {
        ok: false,
        code: 'zip_too_large',
        message: ZIP_TOO_LARGE_ERROR_MESSAGE,
      };
    }
  }

  return { ok: true, totalUncompressedBytes: totalUncompressed };
}
