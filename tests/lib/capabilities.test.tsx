import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  detectCapabilities,
  HASHING_UNAVAILABLE_MESSAGE,
  FOLDER_UPLOAD_UNAVAILABLE_MESSAGE,
} from '../../src/lib/capabilities';
import { sha256Hex } from '../../src/domain/hash';
import { CheckpointsTab } from '../../src/pages/checkpoints/CheckpointsTab';
import { ExportTab } from '../../src/pages/export/ExportTab';
import { AddFilesDialog } from '../../src/ui/AddFilesDialog';
import { ToastProvider } from '../../src/ui/Toast';
import { createEmptyPassport } from '../../src/domain';

// Mock storage functions used by CheckpointsTab and ExportTab
vi.mock('../../src/storage/storageService', () => ({
  listCheckpoints: vi.fn().mockResolvedValue([]),
  listFiles: vi.fn().mockResolvedValue([]),
  listConversations: vi.fn().mockResolvedValue([]),
  recordToTurns: vi.fn().mockReturnValue([]),
  addProjectFiles: vi.fn().mockResolvedValue({ added: 0, skipped: 0, errors: [] }),
  describeStorageError: vi.fn((e: unknown) => String(e)),
}));

vi.mock('../../src/storage', () => ({
  listFiles: vi.fn().mockResolvedValue([]),
  listConversations: vi.fn().mockResolvedValue([]),
  recordToTurns: vi.fn().mockReturnValue([]),
  addProjectFiles: vi.fn().mockResolvedValue({ added: 0, skipped: 0, errors: [] }),
  describeStorageError: vi.fn((e: unknown) => String(e)),
}));

describe('Browser Capabilities Detection & Fallbacks', () => {
  const originalCrypto = window.crypto;

  afterEach(() => {
    Object.defineProperty(window, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });

  it('detects full capabilities when all modern APIs are available', () => {
    const mockEnv = {
      indexedDB: {},
      crypto: { subtle: { digest: vi.fn() } },
      Worker: function () {},
      Blob: function () {},
      File: function () {},
      document: {
        createElement: (tag: string) => {
          if (tag === 'input') {
            return { webkitdirectory: '' };
          }
          return {};
        },
      },
    };
    mockEnv.Blob.prototype = { arrayBuffer: vi.fn() };

    const caps = detectCapabilities(mockEnv);
    expect(caps.indexedDB).toBe(true);
    expect(caps.webCryptoSubtle).toBe(true);
    expect(caps.moduleWorkers).toBe(true);
    expect(caps.fileAndBlobArrayBuffer).toBe(true);
    expect(caps.webkitdirectory).toBe(true);
  });

  it('detects missing webCryptoSubtle and returns false', () => {
    const mockEnv = {
      indexedDB: {},
      crypto: {}, // no subtle
      Worker: function () {},
      Blob: function () {},
      File: function () {},
    };

    const caps = detectCapabilities(mockEnv);
    expect(caps.webCryptoSubtle).toBe(false);
  });

  it('detects missing webkitdirectory when input does not support it', () => {
    const mockEnv = {
      document: {
        createElement: () => ({}),
      },
    };

    const caps = detectCapabilities(mockEnv);
    expect(caps.webkitdirectory).toBe(false);
  });

  it('handles empty or undefined environment without throwing', () => {
    expect(() => detectCapabilities(undefined)).not.toThrow();
    expect(() => detectCapabilities(null)).not.toThrow();
    expect(() => detectCapabilities({})).not.toThrow();

    const caps = detectCapabilities({});
    expect(caps.indexedDB).toBe(false);
    expect(caps.webCryptoSubtle).toBe(false);
    expect(caps.moduleWorkers).toBe(false);
    expect(caps.fileAndBlobArrayBuffer).toBe(false);
    expect(caps.webkitdirectory).toBe(false);
  });

  it('exports plain-language, non-crashing warning messages', () => {
    expect(HASHING_UNAVAILABLE_MESSAGE).toBe(
      'Hashing in checkpoints and export needs a secure (HTTPS) connection.'
    );
    expect(FOLDER_UPLOAD_UNAVAILABLE_MESSAGE).toBe(
      'This browser can’t upload a whole folder. Choose files or a .zip instead.'
    );
  });

  it('sha256Hex returns non-crashing fallback and does not throw when crypto.subtle is deleted', async () => {
    // Delete crypto.subtle
    Object.defineProperty(window, 'crypto', {
      value: {},
      writable: true,
      configurable: true,
    });

    let result: string | null = null;
    expect(async () => {
      result = await sha256Hex('test content');
    }).not.toThrow();

    result = await sha256Hex('test content');
    expect(result).toBe('unavailable');
  });

  it('CheckpointsTab renders friendly warning message and does not throw when crypto.subtle is deleted', async () => {
    // Delete crypto.subtle
    Object.defineProperty(window, 'crypto', {
      value: {},
      writable: true,
      configurable: true,
    });

    const passport = createEmptyPassport('Test Project');
    passport.project.id = 'proj-1';
    passport.project.goal = 'Build Project Passport';
    passport.nextAction = 'Ship Slice 11';

    expect(() => {
      render(
        <ToastProvider>
          <CheckpointsTab projectId="proj-1" passport={passport} />
        </ToastProvider>
      );
    }).not.toThrow();

    expect(screen.getByText(HASHING_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  });

  it('ExportTab renders friendly warning message and does not throw when crypto.subtle is deleted', async () => {
    // Delete crypto.subtle
    Object.defineProperty(window, 'crypto', {
      value: {},
      writable: true,
      configurable: true,
    });

    const passport = createEmptyPassport('Test Project');
    passport.project.id = 'proj-1';
    passport.project.goal = 'Build Project Passport';
    passport.nextAction = 'Ship Slice 11';

    expect(() => {
      render(
        <ToastProvider>
          <ExportTab projectId="proj-1" passport={passport} />
        </ToastProvider>
      );
    }).not.toThrow();

    expect(await screen.findByText(HASHING_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  });

  it('AddFilesDialog falls back to file selection when webkitdirectory is unavailable', () => {
    // Simulate browser without webkitdirectory
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'input') {
        // do not have webkitdirectory
        delete (el as unknown as Record<string, unknown>).webkitdirectory;
      }
      return el;
    });

    expect(() => {
      render(
        <ToastProvider>
          <AddFilesDialog
            isOpen={true}
            onClose={vi.fn()}
            projectId="proj-1"
          />
        </ToastProvider>
      );
    }).not.toThrow();

    expect(screen.getByText(FOLDER_UPLOAD_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(/Folder upload falls back to file selection/i)).toBeInTheDocument();
  });
});
