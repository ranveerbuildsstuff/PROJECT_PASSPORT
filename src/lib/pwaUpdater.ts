import { flushActiveAutosave } from './autosaveFlusher';

export interface PwaUpdateHandlerOptions {
  onBlocked?: (message: string) => void;
  reload?: () => void;
}

export const PWA_UPDATE_TOAST_MESSAGE = 'A new version is ready.';
export const PWA_RELOAD_BLOCKED_MESSAGE =
  'Your changes are still being saved. Try Reload again in a moment.';

/**
 * Handles user clicking "Reload" on the new version notification.
 * Flushes active autosave first. If autosave fails or is dirty/conflicted/invalid,
 * reload is blocked with a friendly warning.
 */
export async function handlePwaReload(
  updateFn?: () => Promise<void> | void,
  options?: PwaUpdateHandlerOptions
): Promise<boolean> {
  const result = await flushActiveAutosave();
  if (!result.ok) {
    options?.onBlocked?.(PWA_RELOAD_BLOCKED_MESSAGE);
    return false;
  }

  if (updateFn) {
    await updateFn();
  }
  if (options?.reload) {
    options.reload();
  } else if (typeof window !== 'undefined' && window.location) {
    window.location.reload();
  }
  return true;
}
