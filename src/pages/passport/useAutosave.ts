import { useState, useEffect, useRef, useCallback } from 'react';
import type { PassportV1 } from '../../domain';
import { applyEditorFields, editorFieldsOf, validatePassportDetailed } from '../../domain';
import {
  getPassport,
  savePassport,
  describeStorageError,
  ProjectNotFound,
  StaleWrite,
} from '../../storage';

import { registerAutosaveFlusher } from '../../lib';

export type SaveStatus = 'saved' | 'saving' | 'not_saved' | 'error' | 'conflict';

export type FlushResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'error' | 'conflict' };

export interface UseAutosaveOptions {
  projectId: string;
  initialPassport: PassportV1;
  debounceMs?: number;
  onSaved?: (savedPassport: PassportV1) => void;
}

export interface UseAutosaveReturn {
  draft: PassportV1;
  setDraft: React.Dispatch<React.SetStateAction<PassportV1>>;
  updateDraft: (updater: (prev: PassportV1) => PassportV1) => void;
  saveStatus: SaveStatus;
  statusMessage: string;
  isDraftValid: boolean;
  validationErrors: string[];
  fieldErrors: Record<string, string>;
  flushSave: () => Promise<FlushResult>;
  resetDraft: (newPassport: PassportV1) => void;
  isDirty: boolean;
  reloadLatest: () => Promise<void>;
  keepMyVersion: () => Promise<FlushResult>;
}

export function useAutosave({
  projectId,
  initialPassport,
  debounceMs = 600,
  onSaved,
}: UseAutosaveOptions): UseAutosaveReturn {
  const [draft, setDraft] = useState<PassportV1>(initialPassport);
  const [rawSaveStatus, setRawSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  // Baseline passport: the last successfully saved or reset state against which external changes are detected
  const baselineRef = useRef<PassportV1>(initialPassport);

  // Track the last successfully saved serialized snapshot to detect dirty state
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(initialPassport));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const inFlightRef = useRef<boolean>(false);
  const lastPassResultRef = useRef<FlushResult>({ ok: true });

  const rawSaveStatusRef = useRef(rawSaveStatus);
  rawSaveStatusRef.current = rawSaveStatus;

  const draftRef = useRef<PassportV1>(draft);
  draftRef.current = draft;

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // Run validation on the current draft
  const validation = validatePassportDetailed(draft);
  const isDraftValid = validation.success;

  // Compute dirty flag
  const currentSnapshot = JSON.stringify(draft);
  const isDirty = currentSnapshot !== lastSavedSnapshotRef.current;

  // (c) Displayed status is derived from (rawSaveStatus, isDirty, isDraftValid) so "Saved" can never show while dirty or in conflict.
  const saveStatus: SaveStatus = (() => {
    if (rawSaveStatus === 'conflict') return 'conflict';
    if (rawSaveStatus === 'error') return 'error';
    if (!isDraftValid) return 'not_saved';
    if (isDirty || rawSaveStatus === 'saving') return 'saving';
    return 'saved';
  })();

  const statusMessage: string = (() => {
    if (saveStatus === 'conflict') {
      return (
        conflictMessage ||
        'This passport was changed somewhere else (another tab or a merge). Reload the latest version, or keep your version.'
      );
    }
    if (saveStatus === 'error') {
      return errorMessage || 'Failed to save changes.';
    }
    if (saveStatus === 'not_saved') {
      const firstError = validation.errors[0] || 'Validation error';
      return `Not saved: ${firstError}`;
    }
    if (saveStatus === 'saving') {
      return 'Saving...';
    }
    return 'Saved';
  })();

  /**
   * (a) Serialize saves through one promise chain (single-flight).
   * A save started while another is in flight uses the latest draft at execution time.
   */
  const runSavePass = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    chainRef.current = chainRef.current
      .catch(() => {}) // preserve chain on error
      .then(async () => {
        // Read latest draft at execution time
        const targetDraft = draftRef.current;
        const targetSnapshot = JSON.stringify(targetDraft);

        // If target already matches what was saved and not in error, nothing to do
        if (targetSnapshot === lastSavedSnapshotRef.current && rawSaveStatusRef.current !== 'error') {
          lastPassResultRef.current = { ok: true };
          return;
        }

        // Check validity at execution time
        const targetValidation = validatePassportDetailed(targetDraft);
        if (!targetValidation.success) {
          setRawSaveStatus('idle');
          lastPassResultRef.current = { ok: false, reason: 'invalid' };
          return;
        }

        setRawSaveStatus('saving');
        inFlightRef.current = true;
        try {
          const latest = await getPassport(projectId);
          if (!latest) {
            throw new ProjectNotFound(projectId);
          }

          const expectedUpdatedAt = baselineRef.current.project.updatedAt;

          // External-change protection: compare stored editor fields with baseline
          const storedFields = editorFieldsOf(latest);
          const baselineFields = editorFieldsOf(baselineRef.current);
          if (JSON.stringify(storedFields) !== JSON.stringify(baselineFields)) {
            setRawSaveStatus('conflict');
            setConflictMessage(
              'This passport was changed somewhere else (another tab or a merge). Reload the latest version, or keep your version.'
            );
            lastPassResultRef.current = { ok: false, reason: 'conflict' };
            return;
          }

          const merged = applyEditorFields(latest, targetDraft);
          await savePassport(merged, { expectedUpdatedAt });

          // Baseline and snapshot update on every successful save
          baselineRef.current = merged;
          lastSavedSnapshotRef.current = targetSnapshot;
          setRawSaveStatus('saved');
          setErrorMessage(null);
          setConflictMessage(null);
          lastPassResultRef.current = { ok: true };

          window.dispatchEvent(new CustomEvent('project-storage-updated'));
          onSavedRef.current?.(merged);
        } catch (err) {
          if (err instanceof StaleWrite || (err as { name?: string })?.name === 'StaleWrite') {
            setRawSaveStatus('conflict');
            setConflictMessage(
              'This passport was changed somewhere else (another tab or a merge). Reload the latest version, or keep your version.'
            );
            lastPassResultRef.current = { ok: false, reason: 'conflict' };
            return;
          }
          const message = describeStorageError(err);
          setRawSaveStatus('error');
          setErrorMessage(message);
          lastPassResultRef.current = { ok: false, reason: 'error' };
        } finally {
          inFlightRef.current = false;
        }
      });

    return chainRef.current;
  }, [projectId]);

  /**
   * (b) flushSave() returns Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'error' | 'conflict' }>.
   * It makes at most ONE pass beyond any in-flight save plus a bounded re-check for edits made meanwhile
   * (max 3 passes), then returns. It must never loop on a failing save.
   */
  const flushSave = useCallback(async (): Promise<FlushResult> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // If draft is invalid, return immediately with zero storage calls
    if (!validatePassportDetailed(draftRef.current).success) {
      lastPassResultRef.current = { ok: false, reason: 'invalid' };
      return { ok: false, reason: 'invalid' };
    }

    let passes = 0;
    const maxPasses = 3;

    while (passes < maxPasses) {
      if (!validatePassportDetailed(draftRef.current).success) {
        lastPassResultRef.current = { ok: false, reason: 'invalid' };
        return { ok: false, reason: 'invalid' };
      }

      const isCurrentlyDirty =
        JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current;

      // If not dirty and nothing in flight, return current state
      if (!isCurrentlyDirty && !inFlightRef.current) {
        if (rawSaveStatusRef.current === 'error') {
          return { ok: false, reason: 'error' };
        }
        if (rawSaveStatusRef.current === 'conflict') {
          return { ok: false, reason: 'conflict' };
        }
        return { ok: true };
      }

      // If dirty (or retrying after error) and not in flight, start a save pass
      if ((isCurrentlyDirty || rawSaveStatusRef.current === 'error') && !inFlightRef.current) {
        void runSavePass();
      }

      passes++;
      await chainRef.current;

      const lastResult = lastPassResultRef.current;
      // If the pass failed (error or conflict), terminate immediately! Never loop on failure!
      if (!lastResult.ok) {
        return lastResult;
      }

      // If saved and no newer edits made meanwhile, succeed
      if (JSON.stringify(draftRef.current) === lastSavedSnapshotRef.current) {
        return { ok: true };
      }
    }

    // Bounded limit reached: check final status
    if (JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current) {
      if (!validatePassportDetailed(draftRef.current).success) {
        return { ok: false, reason: 'invalid' };
      }
      return { ok: false, reason: 'error' };
    }

    return { ok: true };
  }, [runSavePass]);

  /**
   * Reloads the latest passport from storage, discarding unsaved edits and updating the baseline.
   */
  const reloadLatest = useCallback(async (): Promise<void> => {
    try {
      const latest = await getPassport(projectId);
      if (!latest) {
        throw new ProjectNotFound(projectId);
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      baselineRef.current = latest;
      lastSavedSnapshotRef.current = JSON.stringify(latest);
      draftRef.current = latest;
      setDraft(latest);
      setRawSaveStatus('saved');
      setErrorMessage(null);
      setConflictMessage(null);
      lastPassResultRef.current = { ok: true };
      window.dispatchEvent(new CustomEvent('project-storage-updated'));
    } catch (err) {
      const message = describeStorageError(err);
      setRawSaveStatus('error');
      setErrorMessage(message);
    }
  }, [projectId]);

  /**
   * Rebases the baseline on the stored passport and immediately flushes the current draft.
   */
  const keepMyVersion = useCallback(async (): Promise<FlushResult> => {
    try {
      const latest = await getPassport(projectId);
      if (!latest) {
        throw new ProjectNotFound(projectId);
      }
      // Rebase baseline on stored so our next save pass is allowed
      baselineRef.current = latest;
      setRawSaveStatus('idle');
      setConflictMessage(null);
      return await flushSave();
    } catch (err) {
      const message = describeStorageError(err);
      setRawSaveStatus('error');
      setErrorMessage(message);
      return { ok: false, reason: 'error' };
    }
  }, [projectId, flushSave]);

  // Handle draft edits and schedule debounced save
  useEffect(() => {
    // If not dirty, nothing to schedule
    if (!isDirty) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // If invalid, clear timer: do not auto-save invalid drafts
    if (!isDraftValid) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Draft is dirty and valid: schedule debounced save pass
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void runSavePass();
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [draft, isDirty, isDraftValid, debounceMs, runSavePass]);

  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  // Register active flusher for external callers (e.g. Undo-after-merge safety)
  useEffect(() => {
    registerAutosaveFlusher(flushSave);
    return () => {
      registerAutosaveFlusher(null);
    };
  }, [flushSave]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void flushSaveRef.current();
    };
  }, []);

  // Flush on pagehide / beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current) {
        const val = validatePassportDetailed(draftRef.current);
        if (val.success) {
          void flushSaveRef.current();
        } else {
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };

    const handlePageHide = () => {
      if (JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current) {
        const val = validatePassportDetailed(draftRef.current);
        if (val.success) {
          void flushSaveRef.current();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  const updateDraft = useCallback((updater: (prev: PassportV1) => PassportV1) => {
    setDraft((prev) => updater(prev));
  }, []);

  const resetDraft = useCallback((newPassport: PassportV1) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    baselineRef.current = newPassport;
    lastSavedSnapshotRef.current = JSON.stringify(newPassport);
    draftRef.current = newPassport;
    setDraft(newPassport);
    setRawSaveStatus('saved');
    setErrorMessage(null);
    setConflictMessage(null);
    lastPassResultRef.current = { ok: true };
  }, []);

  const prevInitialPassportRef = useRef<PassportV1>(initialPassport);

  // When initialPassport changes externally (e.g. merge applied, checkpoint restored, or project switched)
  useEffect(() => {
    if (prevInitialPassportRef.current !== initialPassport) {
      prevInitialPassportRef.current = initialPassport;
      if (initialPassport.project.updatedAt !== baselineRef.current.project.updatedAt) {
        if (isDirty) {
          setRawSaveStatus('conflict');
          setConflictMessage(
            'This passport was changed somewhere else (another tab or a merge). Reload the latest version, or keep your version.'
          );
        } else {
          resetDraft(initialPassport);
        }
      }
    }
  }, [initialPassport, resetDraft, isDirty]);

  return {
    draft,
    setDraft,
    updateDraft,
    saveStatus,
    statusMessage,
    isDraftValid,
    validationErrors: validation.errors,
    fieldErrors: validation.fieldErrors,
    flushSave,
    resetDraft,
    isDirty,
    reloadLatest,
    keepMyVersion,
  };
}
