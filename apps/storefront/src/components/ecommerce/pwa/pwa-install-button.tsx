'use client';

import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Storefront PWA install affordance (SS-900 Part II). It is intentionally
 * small: the native prompt appears where supported, and other browsers get
 * honest instructions instead of a fake install flow. Registration happens
 * once at shell mount; push.ts reuses the same registration.
 */
export function PwaInstallButton({ mobile = false }: { mobile?: boolean } = {}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Read the display mode after mount; doing this asynchronously avoids a
    // synchronous setState inside the effect and any SSR hydration mismatch.
    const standaloneTimer = window.setTimeout(
      () => setInstalled(isStandalone()),
      0,
    );
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(standaloneTimer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  async function install(): Promise<void> {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice.catch(() => undefined);
      setPrompt(null);
      return;
    }
    setHelpOpen((value) => !value);
  }

  return (
    <div className={mobile ? "relative" : "relative hidden sm:block"}>
      <button
        type="button"
        aria-label="نصب فروشگاه سبز سیستم"
        aria-expanded={helpOpen}
        onClick={() => void install()}
        className={`inline-flex min-h-11 items-center justify-center rounded-control text-fg-secondary transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${mobile ? "w-full gap-2 px-3" : "min-w-11 p-2"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-5">
          <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {mobile ? <span className="text-xs font-semibold">نصب اپلیکیشن</span> : null}
      </button>
      {helpOpen ? (
        <div
          role="status"
          className="absolute end-0 top-full z-50 mt-2 w-64 rounded-card border border-border bg-surface p-3 text-xs leading-6 text-fg-secondary shadow-lift"
        >
          <button
            type="button"
            aria-label="بستن راهنمای نصب"
            onClick={() => setHelpOpen(false)}
            className="absolute end-1.5 top-1.5 rounded-control p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            ×
          </button>
          <p className="font-semibold text-fg">نصب فروشگاه</p>
          <p className="mt-1">
            {isIos()
              ? 'در Safari دکمه اشتراک‌گذاری را بزنید و «افزودن به صفحه اصلی» را انتخاب کنید.'
              : 'از منوی مرورگر گزینه «نصب برنامه» یا «افزودن به صفحه اصلی» را انتخاب کنید.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
