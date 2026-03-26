import { createWebAPIs } from './api';
import { registerSW } from 'virtual:pwa-register';

import type { RuntimeAPIs } from '@openchamber/ui/lib/api/types';
import { pickNormalizedLocale } from '@openchamber/ui/lib/i18n/locale';
import '@openchamber/ui/index.css';
import '@openchamber/ui/styles/fonts';

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
    __OPENCHAMBER_BOOTSTRAP__?: {
      locale?: string;
    };
  }
}

window.__OPENCHAMBER_RUNTIME_APIS__ = createWebAPIs();
window.__OPENCHAMBER_BOOTSTRAP__ = {
  locale: pickNormalizedLocale([navigator.language, ...navigator.languages]),
};

if (import.meta.env.PROD) {
  registerSW({
    onRegisterError(error: unknown) {
      console.warn('[PWA] service worker registration failed:', error);
    },
  });
} else if ('serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {});
}

import('@openchamber/ui/main');
