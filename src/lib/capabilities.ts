/**
 * Pure capability detection for browser features.
 *
 * Invariants:
 * - Pure function, deterministic, zero side effects.
 * - Non-crashing fallbacks with plain-language user messages.
 * - Zero network requests or telemetry.
 */

export interface BrowserCapabilities {
  indexedDB: boolean;
  webCryptoSubtle: boolean;
  moduleWorkers: boolean;
  fileAndBlobArrayBuffer: boolean;
  webkitdirectory: boolean;
}

export interface CapabilityEnvironment {
  indexedDB?: unknown;
  crypto?: {
    subtle?: {
      digest?: unknown;
    };
  } | null;
  Worker?: unknown;
  Blob?: {
    prototype?: {
      arrayBuffer?: unknown;
    };
  } | null;
  File?: unknown;
  document?: {
    createElement?: (tag: string) => unknown;
  } | null;
}

export const HASHING_UNAVAILABLE_MESSAGE =
  'Hashing in checkpoints and export needs a secure (HTTPS) connection.';

export const FOLDER_UPLOAD_UNAVAILABLE_MESSAGE =
  'This browser can’t upload a whole folder. Choose files or a .zip instead.';

/**
 * Detect capabilities in the given environment (defaults to global window).
 */
export function detectCapabilities(
  env: CapabilityEnvironment | null = typeof window !== 'undefined' ? window : {}
): BrowserCapabilities {
  const envObj = (env ?? (typeof window !== 'undefined' ? window : {})) as Record<string, unknown>;

  const indexedDB = Boolean(envObj.indexedDB);

  const crypto =
    envObj.crypto && typeof envObj.crypto === 'object'
      ? (envObj.crypto as Record<string, unknown>)
      : null;
  const subtle =
    crypto && crypto.subtle && typeof crypto.subtle === 'object'
      ? (crypto.subtle as Record<string, unknown>)
      : null;
  const webCryptoSubtle = Boolean(
    subtle && typeof subtle.digest === 'function'
  );

  let moduleWorkers = false;
  if (typeof envObj.Worker === 'function') {
    moduleWorkers = true;
  }

  const blob = envObj.Blob as { prototype?: { arrayBuffer?: unknown } } | undefined;
  const fileAndBlobArrayBuffer = Boolean(
    typeof envObj.Blob !== 'undefined' &&
      blob &&
      blob.prototype &&
      typeof blob.prototype.arrayBuffer === 'function' &&
      typeof envObj.File !== 'undefined'
  );

  let webkitdirectory = false;
  try {
    const doc = (envObj.document ||
      (typeof document !== 'undefined' ? document : null)) as
      | { createElement?: (tag: string) => unknown }
      | null;
    if (doc && typeof doc.createElement === 'function') {
      const input = doc.createElement('input');
      webkitdirectory =
        typeof input === 'object' && input !== null && 'webkitdirectory' in input;
    }
  } catch {
    webkitdirectory = false;
  }

  return {
    indexedDB,
    webCryptoSubtle,
    moduleWorkers,
    fileAndBlobArrayBuffer,
    webkitdirectory,
  };
}
