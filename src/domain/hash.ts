/**
 * Pure, deterministic cryptographic hashing using Web Crypto (SubtleCrypto).
 *
 * Invariants:
 * - Uses standard crypto.subtle.digest('SHA-256', bytes)
 * - Returns lowercase hexadecimal string
 * - Non-blocking, pure, zero logging
 * - Never await inside a Dexie transaction!
 * - Non-crashing fallback if crypto.subtle is unavailable (e.g. insecure context)
 */

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buffer = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Non-crashing fallback for insecure contexts / environments where crypto.subtle is unavailable
  return 'unavailable';
}
