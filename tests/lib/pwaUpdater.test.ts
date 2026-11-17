import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handlePwaReload,
  PWA_UPDATE_TOAST_MESSAGE,
  PWA_RELOAD_BLOCKED_MESSAGE,
} from '../../src/lib/pwaUpdater';
import { registerAutosaveFlusher } from '../../src/lib/autosaveFlusher';

describe('PWA Update-Prompt Reload Logic', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    registerAutosaveFlusher(null);
  });

  afterEach(() => {
    registerAutosaveFlusher(null);
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('exports the exact blocked copy', () => {
    expect(PWA_UPDATE_TOAST_MESSAGE).toBe('A new version is ready.');
    expect(PWA_RELOAD_BLOCKED_MESSAGE).toBe(
      'Your changes are still being saved. Try Reload again in a moment.'
    );
  });

  it('flushes active autosave then reloads when flush succeeds', async () => {
    const flusher = vi.fn().mockResolvedValue({ ok: true });
    registerAutosaveFlusher(flusher);

    const updateFn = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();
    const onBlocked = vi.fn();

    const reloaded = await handlePwaReload(updateFn, { reload, onBlocked });

    expect(flusher).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(reloaded).toBe(true);
  });

  it('blocks reload and triggers onBlocked when flush fails with an error', async () => {
    const flusher = vi.fn().mockResolvedValue({ ok: false, reason: 'error' });
    registerAutosaveFlusher(flusher);

    const updateFn = vi.fn();
    const reload = vi.fn();
    const onBlocked = vi.fn();

    const reloaded = await handlePwaReload(updateFn, { reload, onBlocked });

    expect(flusher).toHaveBeenCalledTimes(1);
    expect(updateFn).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith(
      'Your changes are still being saved. Try Reload again in a moment.'
    );
    expect(reloaded).toBe(false);
  });

  it('blocks reload and triggers onBlocked when an invalid draft blocks save', async () => {
    const flusher = vi.fn().mockResolvedValue({ ok: false, reason: 'invalid' });
    registerAutosaveFlusher(flusher);

    const updateFn = vi.fn();
    const reload = vi.fn();
    const onBlocked = vi.fn();

    const reloaded = await handlePwaReload(updateFn, { reload, onBlocked });

    expect(flusher).toHaveBeenCalledTimes(1);
    expect(updateFn).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith(
      'Your changes are still being saved. Try Reload again in a moment.'
    );
    expect(reloaded).toBe(false);
  });

  it('blocks reload when flusher throws an unhandled rejection', async () => {
    const flusher = vi.fn().mockRejectedValue(new Error('Storage disk failure'));
    registerAutosaveFlusher(flusher);

    const updateFn = vi.fn();
    const reload = vi.fn();
    const onBlocked = vi.fn();

    const reloaded = await handlePwaReload(updateFn, { reload, onBlocked });

    expect(flusher).toHaveBeenCalledTimes(1);
    expect(updateFn).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith(
      'Your changes are still being saved. Try Reload again in a moment.'
    );
    expect(reloaded).toBe(false);
  });

  it('proceeds with reload when no active flusher is registered (idle state)', async () => {
    registerAutosaveFlusher(null);

    const updateFn = vi.fn();
    const reload = vi.fn();
    const onBlocked = vi.fn();

    const reloaded = await handlePwaReload(updateFn, { reload, onBlocked });

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(reloaded).toBe(true);
  });
});
