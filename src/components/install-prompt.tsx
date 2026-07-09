'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'fco-install-dismissed';

/**
 * A slim "Install app" banner shown inside the client PWA. Uses the native
 * install prompt on Android/Chromium; shows Share→Add to Home Screen hint on
 * iOS. Hidden when already installed (standalone) or previously dismissed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const ios = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
    // Defer out of the effect body (state syncs after mount, avoiding a
    // hydration mismatch and the no-sync-setState-in-effect rule).
    const t = setTimeout(() => {
      setIsIOS(ios);
      if (ios) setShow(true);
    }, 0);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="mx-4 mb-3 flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">Install this app</p>
        {isIOS ? (
          <p className="truncate text-xs text-ink-500">Tap Share ⎙, then “Add to Home Screen”.</p>
        ) : (
          <p className="truncate text-xs text-ink-500">Add it to your home screen for quick access.</p>
        )}
      </div>
      {!isIOS && deferred ? (
        <button
          onClick={install}
          className="rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Install
        </button>
      ) : null}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-full p-1 text-ink-400 hover:text-ink-700"
      >
        ✕
      </button>
    </div>
  );
}
