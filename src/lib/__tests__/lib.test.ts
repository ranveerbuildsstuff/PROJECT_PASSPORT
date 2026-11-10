import { describe, it, expect } from 'vitest';
import {
  uint8ArrayToBase64,
  base64ToUint8Array,
  formatBytes,
  formatProjectStatus,
} from '../index';

describe('src/lib utilities', () => {
  it('roundtrips binary data with uint8ArrayToBase64 and base64ToUint8Array', () => {
    const sample = new Uint8Array([0, 1, 2, 255, 128, 42, 64, 137, 80]);
    const b64 = uint8ArrayToBase64(sample);
    const decoded = base64ToUint8Array(b64);
    expect(Array.from(decoded)).toEqual(Array.from(sample));
  });

  it('handles chunking in uint8ArrayToBase64 for arrays larger than 32 KB', () => {
    const size = 70000;
    const large = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      large[i] = (i * 31) % 256;
    }
    const b64 = uint8ArrayToBase64(large);
    const decoded = base64ToUint8Array(b64);
    expect(decoded.length).toBe(size);
    expect(Array.from(decoded.subarray(0, 100))).toEqual(Array.from(large.subarray(0, 100)));
    expect(Array.from(decoded.subarray(size - 100))).toEqual(
      Array.from(large.subarray(size - 100))
    );
  });

  it('formats bytes into human readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-10)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
    expect(formatBytes(1099511627776)).toBe('1.0 TB');
  });

  it('maps project status to clean human-readable labels without prefixes or underscores', () => {
    expect(formatProjectStatus('idea')).toBe('Idea');
    expect(formatProjectStatus('in_progress')).toBe('In progress');
    expect(formatProjectStatus('paused')).toBe('Paused');
    expect(formatProjectStatus('done')).toBe('Done');
    expect(formatProjectStatus('unknown_custom')).toBe('unknown_custom');
  });
});
