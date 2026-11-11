import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave, type FlushResult } from '../useAutosave';
import { createEmptyPassport } from '../../../domain';
import * as storage from '../../../storage';
import { QuotaExceeded } from '../../../storage';

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
    vi.spyOn(storage, 'savePassport').mockRejectedValue(new QuotaExceeded());

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
    expect(result.current.statusMessage).toContain('quota has been exceeded');
  });

  it('shows plain language and never the raw message when save rejects with an unknown error', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    const rawTechnicalError =
      'CRITICAL_INTERNAL_DB_CRASH: 0xDEADBEEF secret-sentinel 123e4567-e89b-12d3-a456-426614174000';
    vi.spyOn(storage, 'savePassport').mockRejectedValue(new Error(rawTechnicalError));

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
        project: { ...prev.project, summary: 'Updated summary' },
      }));
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(result.current.saveStatus).toBe('error');
    expect(result.current.statusMessage).toBe(
      'An unexpected storage error occurred. Your changes could not be saved.'
    );
    expect(result.current.statusMessage).not.toContain('CRITICAL_INTERNAL_DB_CRASH');
    expect(result.current.statusMessage).not.toContain('0xDEADBEEF');
    expect(result.current.statusMessage).not.toContain('secret-sentinel');
    expect(result.current.statusMessage).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('ensures merge safety: preserves files and conversations modified elsewhere', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';
    initial.files = [];
    initial.conversations = [];

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

    expect(savedPayload.instructions).toEqual(['Always use TypeScript']);
    expect(savedPayload.files).toHaveLength(1);
    expect(savedPayload.files[0]?.path).toBe('src/secret.ts');
    expect(savedPayload.conversations).toHaveLength(1);
    expect(savedPayload.conversations[0]?.id).toBe('conv-99');
  });

  // Ticket T2 Item 8 required Vitest tests:
  it('edit during in-flight save keeps "Saving" status and never shows "Saved" while dirty', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    let resolveFirstSave!: () => void;
    const firstSavePromise = new Promise<void>((res) => {
      resolveFirstSave = res;
    });

    let currentStored = initial;
    vi.spyOn(storage, 'getPassport').mockImplementation(async () => currentStored);
    const saveSpy = vi.spyOn(storage, 'savePassport')
      .mockImplementationOnce(async (p) => {
        await firstSavePromise;
        currentStored = p;
      })
      .mockImplementation(async (p) => {
        currentStored = p;
      });

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // Initial edit 1
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Edit 1' },
      }));
    });

    // Advance 600ms so save 1 begins execution and enters in-flight state
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toBe('saving');

    // While save 1 is in-flight, make edit 2
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Edit 2' },
      }));
    });

    // Status MUST remain 'saving'
    expect(result.current.saveStatus).toBe('saving');
    expect(result.current.statusMessage).toBe('Saving...');

    // Resolve save 1
    await act(async () => {
      resolveFirstSave();
      await Promise.resolve();
    });

    // Because edit 2 is dirty, status MUST NOT show 'Saved'
    expect(result.current.isDirty).toBe(true);
    expect(result.current.saveStatus).toBe('saving');
    expect(result.current.statusMessage).toBe('Saving...');

    // Advance timer for edit 2 save
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.statusMessage).toBe('Saved');
  });

  it('rapid edits end with the LAST draft stored', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    const saveSpy = vi.spyOn(storage, 'savePassport').mockResolvedValue();

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // Rapid edits within debounce interval
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Rapid 1' },
      }));
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Rapid 2' },
      }));
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Rapid 3 Final' },
      }));
    });

    // Advance full 600ms debounce
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    // Exactly one save occurred, and it has the LAST draft
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saved = saveSpy.mock.calls[0]?.[0];
    expect(saved?.project.name).toBe('Rapid 3 Final');
  });

  it('flush awaits in-flight save', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    let resolveInFlight!: () => void;
    const inFlightPromise = new Promise<void>((res) => {
      resolveInFlight = res;
    });

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    vi.spyOn(storage, 'savePassport').mockImplementation(() => inFlightPromise);

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // Trigger an edit and start the save
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'In-Flight Edit' },
      }));
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    let flushResolved = false;
    let flushPromise: Promise<void>;
    act(() => {
      flushPromise = result.current.flushSave().then(() => {
        flushResolved = true;
      });
    });

    // flushSave MUST NOT have resolved yet because save is in flight!
    await act(async () => {
      await Promise.resolve();
    });
    expect(flushResolved).toBe(false);

    // Resolve in-flight save
    await act(async () => {
      resolveInFlight();
      await flushPromise;
    });

    // Now flushSave has resolved
    expect(flushResolved).toBe(true);
  });

  it('two overlapping triggers produce no stale overwrite', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    let resolveFirst!: () => void;
    const firstSavePromise = new Promise<void>((res) => {
      resolveFirst = res;
    });

    let currentStored = initial;
    vi.spyOn(storage, 'getPassport').mockImplementation(async () => currentStored);
    const saveSpy = vi.spyOn(storage, 'savePassport')
      .mockImplementationOnce(async (p) => {
        await firstSavePromise;
        currentStored = p;
      })
      .mockImplementation(async (p) => {
        currentStored = p;
      });

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // Trigger 1
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Trigger 1' },
      }));
    });

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Trigger 2 before Trigger 1 completes
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Trigger 2' },
      }));
    });

    // Call flushSave immediately (overlapping trigger)
    let flushDone = false;
    let flushPromise: Promise<void>;
    act(() => {
      flushPromise = result.current.flushSave().then(() => {
        flushDone = true;
      });
    });

    // Resolve first save
    await act(async () => {
      resolveFirst();
      await flushPromise;
    });

    expect(flushDone).toBe(true);
    expect(saveSpy).toHaveBeenCalledTimes(2);

    // The second save contains Trigger 2 (no stale overwrite)
    const secondCall = saveSpy.mock.calls[1]?.[0];
    expect(secondCall?.project.name).toBe('Trigger 2');
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.isDirty).toBe(false);
  });

  it('flushSave with always-rejecting save resolves {ok:false,reason:"error"} and savePassport is called <= 3 times', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    const saveSpy = vi.spyOn(storage, 'savePassport').mockRejectedValue(new Error('Disk failure'));

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
        project: { ...prev.project, name: 'Failing Name' },
      }));
    });

    let flushRes!: FlushResult;
    await act(async () => {
      flushRes = await result.current.flushSave();
    });

    expect(flushRes).toEqual({ ok: false, reason: 'error' });
    expect(saveSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(saveSpy.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.current.saveStatus).toBe('error');
    expect(result.current.statusMessage).toContain('An unexpected storage error occurred');
  });

  it('ProjectNotFound resolves {ok:false,reason:"error"} and savePassport is called <= 3 times', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-missing';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(null);
    const saveSpy = vi.spyOn(storage, 'savePassport').mockResolvedValue();

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-missing',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Missing Project' },
      }));
    });

    let flushRes!: FlushResult;
    await act(async () => {
      flushRes = await result.current.flushSave();
    });

    expect(flushRes).toEqual({ ok: false, reason: 'error' });
    expect(saveSpy.mock.calls.length).toBeLessThanOrEqual(3);
    expect(result.current.saveStatus).toBe('error');
    expect(result.current.statusMessage).toContain('This project was not found');
  });

  it('invalid draft returns {ok:false,reason:"invalid"} with zero storage calls', async () => {
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

    // Make draft invalid (empty task text)
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        tasks: [{ id: 'task-1', text: '', status: 'todo', priority: 'medium' }],
      }));
    });

    let flushRes!: FlushResult;
    await act(async () => {
      flushRes = await result.current.flushSave();
    });

    expect(flushRes).toEqual({ ok: false, reason: 'invalid' });
    expect(getSpy).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('not_saved');
  });

  it('edit during flush is saved or reported, never lost', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    let resolveFirst!: () => void;
    const firstSavePromise = new Promise<void>((res) => {
      resolveFirst = res;
    });

    let currentStored = initial;
    vi.spyOn(storage, 'getPassport').mockImplementation(async () => currentStored);
    const saveSpy = vi.spyOn(storage, 'savePassport')
      .mockImplementationOnce(async (p) => {
        await firstSavePromise;
        currentStored = p;
      })
      .mockImplementation(async (p) => {
        currentStored = p;
      });

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // Edit 1
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'First Edit' },
      }));
    });

    // Start flush
    let flushPromise!: Promise<FlushResult>;
    act(() => {
      flushPromise = result.current.flushSave();
    });

    // Allow pass 1 to begin execution and call savePassport with 'First Edit'
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // While pass 1 is waiting for firstSavePromise, make Edit 2
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Second Edit Made Meanwhile' },
      }));
    });

    // Resolve pass 1 and wait for flushSave to finish
    let finalRes!: FlushResult;
    await act(async () => {
      resolveFirst();
      finalRes = await flushPromise;
    });

    expect(finalRes).toEqual({ ok: true });
    expect(saveSpy).toHaveBeenCalledTimes(2);
    const lastSaved = saveSpy.mock.calls[1]?.[0];
    expect(lastSaved?.project.name).toBe('Second Edit Made Meanwhile');
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.isDirty).toBe(false);
  });

  it('conflict blocks the write (savePassport not called) and each button\'s behaviour', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    // Simulate external change in storage (different editor fields)
    const externallyModified = {
      ...initial,
      project: {
        ...initial.project,
        goal: 'Goal changed elsewhere',
      },
    };

    vi.spyOn(storage, 'getPassport').mockResolvedValue(externallyModified);
    const saveSpy = vi.spyOn(storage, 'savePassport').mockResolvedValue();

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    // User edits draft locally
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, goal: 'My Local Goal' },
      }));
    });

    let flushRes!: FlushResult;
    await act(async () => {
      flushRes = await result.current.flushSave();
    });

    expect(flushRes).toEqual({ ok: false, reason: 'conflict' });
    expect(saveSpy).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('conflict');
    expect(result.current.statusMessage).toContain('This passport was changed somewhere else');

    // Test Button 1: "Reload latest"
    await act(async () => {
      await result.current.reloadLatest();
    });

    expect(result.current.draft.project.goal).toBe('Goal changed elsewhere');
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.isDirty).toBe(false);

    // Now test Button 2: "Keep my version"
    // Make another local edit
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, goal: 'Goal Kept Over External' },
      }));
    });

    // Simulate another external modification
    const thirdModified = {
      ...externallyModified,
      project: { ...externallyModified.project, goal: 'Third External Change' },
    };
    vi.spyOn(storage, 'getPassport').mockResolvedValue(thirdModified);

    // Trigger flush -> conflict again
    await act(async () => {
      flushRes = await result.current.flushSave();
    });
    expect(flushRes).toEqual({ ok: false, reason: 'conflict' });
    expect(result.current.saveStatus).toBe('conflict');

    // Click "Keep my version"
    let keepRes!: FlushResult;
    await act(async () => {
      keepRes = await result.current.keepMyVersion();
    });

    expect(keepRes).toEqual({ ok: true });
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0]?.[0]?.project.goal).toBe('Goal Kept Over External');
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.isDirty).toBe(false);
  });

  it('Try again recovers after a transient failure', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);
    const saveSpy = vi.spyOn(storage, 'savePassport')
      .mockRejectedValueOnce(new Error('Transient storage locked'))
      .mockResolvedValue();

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
        project: { ...prev.project, name: 'Transient Test' },
      }));
    });

    // First attempt fails
    let firstRes!: FlushResult;
    await act(async () => {
      firstRes = await result.current.flushSave();
    });
    expect(firstRes).toEqual({ ok: false, reason: 'error' });
    expect(result.current.saveStatus).toBe('error');

    // User clicks "Try again" (calls flushSave)
    let retryRes!: FlushResult;
    await act(async () => {
      retryRes = await result.current.flushSave();
    });

    expect(retryRes).toEqual({ ok: true });
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.isDirty).toBe(false);
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  it('displayed status never "Saved" while dirty or in conflict', async () => {
    const initial = createEmptyPassport('Initial Project');
    initial.project.id = 'proj-1';

    vi.spyOn(storage, 'getPassport').mockResolvedValue(initial);

    const { result } = renderHook(() =>
      useAutosave({
        projectId: 'proj-1',
        initialPassport: initial,
        debounceMs: 600,
      })
    );

    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.statusMessage).toBe('Saved');

    // Make edit: dirty
    act(() => {
      result.current.updateDraft((prev) => ({
        ...prev,
        project: { ...prev.project, name: 'Dirty Name' },
      }));
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.saveStatus).not.toBe('saved');
    expect(result.current.statusMessage).not.toBe('Saved');

    // If external conflict occurs
    const conflicting = {
      ...initial,
      project: { ...initial.project, name: 'External Name' },
    };
    vi.spyOn(storage, 'getPassport').mockResolvedValue(conflicting);

    await act(async () => {
      await result.current.flushSave();
    });

    expect(result.current.saveStatus).toBe('conflict');
    expect(result.current.statusMessage).not.toBe('Saved');
    expect(result.current.statusMessage).toContain('changed somewhere else');
  });
});
