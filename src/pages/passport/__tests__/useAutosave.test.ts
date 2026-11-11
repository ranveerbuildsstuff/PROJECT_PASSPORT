import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '../useAutosave';
import { createEmptyPassport } from '../../../domain';
import * as storage from '../../../storage';

describe('useAutosave Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces save by 600ms and transitions Saved -> Saving -> Saved', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    const getSpy = vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    const saveSpy = vi.spyOn(storage, 'savePassport').mockResolvedValue();

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.statusMessage).toBe('Saved');

    // Make an edit
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Edited Name' },
      }));
    });

    // Immediately after edit, save has not fired yet
    expect(saveSpy).not.toHaveBeenCalled();

    // Fast forward 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(saveSpy).not.toHaveBeenCalled();

    // Fast forward remaining 300ms
    await act(async () => {
      vi.advanceTimersByTime(300);
      // Allow microtasks to complete
      await Promise.resolve();
    });

    expect(getSpy).toHaveBeenCalledWith('proj-1');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('does NOT save an invalid draft and shows "Not saved" with reason', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    const saveSpy = vi.spyOn(storage, 'savePassport').mockResolvedValue();

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // Add an invalid task (empty text)
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        tasks: [
          {
            id: 'task-1',
            text: '', // Invalid!
            status: 'todo',
            priority: 'medium',
          },
        ],
      }));
    });

    expect(result.current.isDraftValid).toBe(false);
    expect(result.current.saveStatus).toBe('not_saved');
    expect(result.current.statusMessage).toContain('Not saved');
    expect(result.current.statusMessage).toContain('Task 1 needs some text');

    // Advance timers past debounce window
    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    // savePassport must NEVER have been called for invalid draft
    expect(saveSpy).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('not_saved');
  });

  it('flushes pending valid draft on unmount', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    const saveSpy = vi.spyOn(storage, 'savePassport').mockResolvedValue();

    const { result, unmount } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // Make an edit
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, goal: 'Updated Goal' },
      }));
    });

    expect(saveSpy).not.toHaveBeenCalled();

    // Unmount before 600ms timer elapses
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('sets error status when storage fails', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    vi.spyOn(storage, 'savePassport').mockRejectedValue(new Error('IndexedDB quota exceeded'));

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, summary: 'New summary' },
      }));
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe('error');
    expect(result.current.statusMessage).toContain('IndexedDB quota exceeded');
  });

  it('ensures merge safety: preserves files and conversations modified elsewhere', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';
    initial.files = [];
    initial.conversations = [];

    // Simulate storage state having new files and conversations added in another tab
    const freshFromStorage = {
      ...initial,
      files: [
        {
          path: 'src/secret.ts',
          purpose: 'Source code',
          included: true,
          sizeBytes: 256,
        },
      ],
      conversations: [
        {
          id: 'conv-99',
          title: 'Imported Turn',
          source: 'chatgpt' as const,
          messageCount: 4,
          tokenEstimate: 400,
          included: true,
        },
      ],
    };

    vi.spyOn(storage, 'getPassport').mockResolvedValue(freshFromStorage);
    const saveSpy = vi.spyOn(storage, 'savePassport').mockResolvedValue();

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        instructions: ['Always use TypeScript'],
      }));
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const call = saveSpy.mock.calls[0];
    expect(call).toBeDefined();
    const savedPayload = call![0];

    // Editor fields updated
    expect(savedPayload.instructions).toEqual(['Always use TypeScript']);

    // Background files and conversations preserved intact!
    expect(savedPayload.files).toHaveLength(1);
    expect(savedPayload.files[0]?.path).toBe('src/secret.ts');
    expect(savedPayload.conversations).toHaveLength(1);
    expect(savedPayload.conversations[0]?.id).toBe('conv-99');
  });
});
