'use client';

import { useEffect } from 'react';

/** Registers the offline-shell service worker once, on the client. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
