import { describe, it, expect } from 'vitest';
import { sha256Hex } from '../../src/domain/hash';

describe('hash domain module', () => {
  it('hashes empty input to standard SHA-256 digest', async () => {
    const hash = await sha256Hex('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc" to standard SHA-256 test vector', async () => {
    const hash = await sha256Hex('abc');
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes binary Uint8Array data deterministically', async () => {
    const bytes = new Uint8Array([97, 98, 99]); // "abc" in ASCII
    const hash1 = await sha256Hex(bytes);
    const hash2 = await sha256Hex(bytes);
    expect(hash1).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hash1).toBe(hash2);
  });

  it('handles Uint8Array subarray view correctly', async () => {
    // Array: [0, 1, 97, 98, 99, 2, 3] where indices 2..4 are 97, 98, 99 ("abc")
    const buffer = new Uint8Array([0, 1, 97, 98, 99, 2, 3]);
    const subarray = buffer.subarray(2, 5);
    const hash = await sha256Hex(subarray);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
