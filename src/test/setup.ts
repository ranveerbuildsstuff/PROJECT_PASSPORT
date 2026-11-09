import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Ensure structuredClone is available in jsdom test environment
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(obj: T): T => {
    if (obj === undefined) return undefined as unknown as T;
    return JSON.parse(JSON.stringify(obj)) as T;
  };
}
