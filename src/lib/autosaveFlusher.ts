type Flusher = () => Promise<unknown>;

let activeFlusher: Flusher | null = null;

export function registerAutosaveFlusher(flusher: Flusher | null): void {
  activeFlusher = flusher;
}

export async function flushActiveAutosave(): Promise<void> {
  if (activeFlusher) {
    await activeFlusher();
  }
}
