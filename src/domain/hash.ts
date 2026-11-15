/**
 * Pure, deterministic cryptographic hashing using Web Crypto (SubtleCrypto).
 *
 * Invariants:
 * - Uses standard crypto.subtle.digest('SHA-256', bytes)
 * - Returns lowercase hexadecimal string
 * - Non-blocking, pure, zero logging
 * - Never await inside a Dexie transaction!
 */

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buffer = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for node/test environments if crypto.subtle is somehow unavailable
  throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
}
