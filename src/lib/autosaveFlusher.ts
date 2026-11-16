export interface AutosaveFlushResult {
  ok: boolean;
  error?: string;
}

type Flusher = () => Promise<AutosaveFlushResult | boolean | unknown>;

let activeFlusher: Flusher | null = null;

export function registerAutosaveFlusher(flusher: Flusher | null): void {
  activeFlusher = flusher;
}

export async function flushActiveAutosave(): Promise<AutosaveFlushResult> {
  if (activeFlusher) {
    try {
      const res = await activeFlusher();
      if (typeof res === 'object' && res !== null && 'ok' in res) {
        return { ok: Boolean((res as { ok: boolean }).ok) };
      }
      if (typeof res === 'boolean') {
        return { ok: res };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { ok: true };
}
