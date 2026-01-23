import { createWebAPIs } from './api';
import { registerSW } from 'virtual:pwa-register';

import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import '@openchamber/ui/index.css';
import '@openchamber/ui/styles/fonts';

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

window.__OPENCHAMBER_RUNTIME_APIS__ = createWebAPIs();

registerSW({
  onRegistered(registration: ServiceWorkerRegistration | undefined) {
    if (!registration) {
      return;
    }

    // Periodic update check (best-effort)
    setInterval(() => {
      void registration.update();
    }, 60 * 60 * 1000);
  },
  onRegisterError(error: unknown) {
    console.warn('[PWA] service worker registration failed:', error);
  },
});

import('@openchamber/ui/main');
