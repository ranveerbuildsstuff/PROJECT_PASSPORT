import { useState, useEffect, useRef, useCallback } from 'react';
import type { PassportV1 } from '../../domain';
import { applyEditorFields, validatePassportDetailed } from '../../domain';
import { getPassport, savePassport, describeStorageError, ProjectNotFound } from '../../storage';

export type SaveStatus = 'saved' | 'saving' | 'not_saved' | 'error';

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
  flushSave: () => Promise<void>;
  resetDraft: (newPassport: PassportV1) => void;
  isDirty: boolean;
}

export function useAutosave({
  projectId,
  initialPassport,
  debounceMs = 600,
  onSaved,
}: UseAutosaveOptions): UseAutosaveReturn {
  const [draft, setDraft] = useState<PassportV1>(initialPassport);
  const [rawSaveStatus, setRawSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Track the last successfully saved serialized snapshot to detect dirty state
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(initialPassport));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const inFlightRef = useRef<boolean>(false);

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

  // (c) Displayed status is derived from (saveStatus, isDirty, isDraftValid) so "Saved" can never show while dirty.
  const saveStatus: SaveStatus = (() => {
    if (rawSaveStatus === 'error') return 'error';
    if (!isDraftValid) return 'not_saved';
    if (isDirty || rawSaveStatus === 'saving') return 'saving';
    return 'saved';
  })();

  const statusMessage: string = (() => {
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

        // If target already matches what was saved, nothing to do
        if (targetSnapshot === lastSavedSnapshotRef.current) {
          return;
        }

        // Check validity at execution time
        const targetValidation = validatePassportDetailed(targetDraft);
        if (!targetValidation.success) {
          setRawSaveStatus('idle');
          return;
        }

        setRawSaveStatus('saving');
        inFlightRef.current = true;
        try {
          const latest = await getPassport(projectId);
          if (!latest) {
            throw new ProjectNotFound(projectId);
          }

          const merged = applyEditorFields(latest, targetDraft);
          await savePassport(merged);

          lastSavedSnapshotRef.current = targetSnapshot;
          setRawSaveStatus('saved');
          setErrorMessage(null);

          window.dispatchEvent(new CustomEvent('project-storage-updated'));
          onSavedRef.current?.(merged);
        } catch (err) {
          const message = describeStorageError(err);
          setRawSaveStatus('error');
          setErrorMessage(message);
        } finally {
          inFlightRef.current = false;
        }
      });

    return chainRef.current;
  }, [projectId]);

  /**
   * (b) flushSave() resolves only when the chain is idle and the draft is saved or invalid.
   */
  const flushSave = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // If currently dirty and valid, enqueue a save pass
    if (
      JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current &&
      validatePassportDetailed(draftRef.current).success
    ) {
      void runSavePass();
    }

    // Await the chain
    await chainRef.current;

    // Loop until completely idle and the current draft is either saved or invalid
    while (
      JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current &&
      validatePassportDetailed(draftRef.current).success
    ) {
      void runSavePass();
      await chainRef.current;
    }
  }, [runSavePass]);

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

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (
        JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current &&
        validatePassportDetailed(draftRef.current).success
      ) {
        void runSavePass();
      }
    };
  }, [runSavePass]);

  // Flush on pagehide / beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(draftRef.current) !== lastSavedSnapshotRef.current) {
        const val = validatePassportDetailed(draftRef.current);
        if (val.success) {
          void runSavePass();
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
          void runSavePass();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [runSavePass]);

  const updateDraft = useCallback((updater: (prev: PassportV1) => PassportV1) => {
    setDraft((prev) => updater(prev));
  }, []);

  const resetDraft = useCallback((newPassport: PassportV1) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastSavedSnapshotRef.current = JSON.stringify(newPassport);
    draftRef.current = newPassport;
    setDraft(newPassport);
    setRawSaveStatus('saved');
    setErrorMessage(null);
  }, []);

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
  };
}
