import { useEffect, useRef } from 'react';
import { useToast } from './useToast';
import {
  handlePwaReload,
  PWA_UPDATE_TOAST_MESSAGE,
} from '../lib/pwaUpdater';

export function usePwaUpdate(): void {
  const { showToast } = useToast();
  const updateSwRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Dynamically import virtual:pwa-register
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        updateSwRef.current = registerSW({
          onNeedRefresh() {
            showToast(
              PWA_UPDATE_TOAST_MESSAGE,
              'info',
              undefined,
              {
                label: 'Reload',
                onClick: async () => {
                  await handlePwaReload(
                    async () => {
                      if (updateSwRef.current) {
                        await updateSwRef.current(true);
                      }
                    },
                    {
                      onBlocked: (msg) => {
                        showToast(msg, 'warning');
                      },
                    }
                  );
                },
              },
              0 // Persistent toast until action clicked or dismissed
            );
          },
        });
      })
      .catch(() => {
        // Ignored when virtual:pwa-register is absent (e.g. unit tests or SSR)
      });
  }, [showToast]);
}
