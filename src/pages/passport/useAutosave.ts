import { useState, useEffect, useRef, useCallback } from 'react';
import type { PassportV1 } from '../../domain';
import { applyEditorFields, validatePassportDetailed } from '../../domain';
import { getPassport, savePassport } from '../../storage';

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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [statusMessage, setStatusMessage] = useState<string>('Saved');

  // Track the last successfully saved serialized snapshot to detect dirty state
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(initialPassport));
  const isDirtyRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<PassportV1>(draft);
  draftRef.current = draft;

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // Run validation on the current draft
  const validation = validatePassportDetailed(draft);
  const isDraftValid = validation.success;
  const validationErrorKey = validation.errors.join('; ');

  // Compute dirty flag
  const currentSnapshot = JSON.stringify(draft);
  const isDirty = currentSnapshot !== lastSavedSnapshotRef.current;
  isDirtyRef.current = isDirty;

  /**
   * Persists valid draft to storage after merging with fresh latest passport from Dexie.
   */
  const performSave = useCallback(
    async (targetDraft: PassportV1): Promise<boolean> => {
      const targetValidation = validatePassportDetailed(targetDraft);
      if (!targetValidation.success) {
        setSaveStatus('not_saved');
        setStatusMessage(`Not saved: ${targetValidation.errors[0] || 'Validation failed'}`);
        return false;
      }

      setSaveStatus('saving');
      setStatusMessage('Saving...');

      try {
        const latest = await getPassport(projectId);
        if (!latest) {
          throw new Error(`Project "${projectId}" was not found.`);
        }

        const merged = applyEditorFields(latest, targetDraft);
        await savePassport(merged);

        lastSavedSnapshotRef.current = JSON.stringify(targetDraft);
        isDirtyRef.current = false;
        setSaveStatus('saved');
        setStatusMessage('Saved');

        window.dispatchEvent(new CustomEvent('project-storage-updated'));
        onSavedRef.current?.(merged);
        return true;
      } catch (err) {
        setSaveStatus('error');
        setStatusMessage(err instanceof Error ? err.message : 'Failed to save changes.');
        return false;
      }
    },
    [projectId]
  );

  /**
   * Flushes any pending debounced save immediately.
   */
  const flushSave = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isDirtyRef.current) {
      await performSave(draftRef.current);
    }
  }, [performSave]);

  // Handle draft edits and schedule debounced save
  useEffect(() => {
    // If not dirty, keep saved status
    if (!isDirty) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setSaveStatus('saved');
      setStatusMessage('Saved');
      return;
    }

    // If draft is invalid: do NOT save, show "Not saved", keep in memory
    if (!isDraftValid) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setSaveStatus('not_saved');
      setStatusMessage(`Not saved: ${validationErrorKey.split('; ')[0] || 'Validation error'}`);
      return;
    }

    // Draft is dirty and valid: schedule debounced save
    setSaveStatus('saving');
    setStatusMessage('Saving...');

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSave(draftRef.current);
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [draft, isDirty, isDraftValid, validationErrorKey, debounceMs, performSave]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (isDirtyRef.current) {
        const val = validatePassportDetailed(draftRef.current);
        if (val.success) {
          performSave(draftRef.current);
        }
      }
    };
  }, [performSave]);

  // Flush on pagehide / beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        const val = validatePassportDetailed(draftRef.current);
        if (val.success) {
          performSave(draftRef.current);
        } else {
          // Alert user before losing invalid edits
          e.preventDefault();
          e.returnValue = '';
        }
      }
    };

    const handlePageHide = () => {
      if (isDirtyRef.current) {
        const val = validatePassportDetailed(draftRef.current);
        if (val.success) {
          performSave(draftRef.current);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [performSave]);

  const updateDraft = useCallback((updater: (prev: PassportV1) => PassportV1) => {
    setDraft((prev) => updater(prev));
  }, []);

  const resetDraft = useCallback((newPassport: PassportV1) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastSavedSnapshotRef.current = JSON.stringify(newPassport);
    isDirtyRef.current = false;
    setDraft(newPassport);
    setSaveStatus('saved');
    setStatusMessage('Saved');
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
