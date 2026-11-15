import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';

// Ensure structuredClone is available in jsdom test environment
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(obj: T): T => {
    if (obj === undefined) return undefined as unknown as T;
    return JSON.parse(JSON.stringify(obj)) as T;
  };
}

// Polyfill Blob.prototype.arrayBuffer for jsdom if absent
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob as ArrayBuffer'));
      reader.readAsArrayBuffer(this);
    });
  };
}

// Polyfill File.prototype.text for jsdom if absent
if (typeof File !== 'undefined' && typeof File.prototype.text !== 'function') {
  File.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error || new Error('Failed to read file as text'));
      reader.readAsText(this);
    });
  };
}

