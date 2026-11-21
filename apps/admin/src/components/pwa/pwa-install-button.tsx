'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { IconButton } from '../ui/icon-button'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Small install affordance for the Admin PWA. It appears only when the app is
 * not already installed; supported browsers receive the native prompt, while
 * other platforms get a short, honest instruction panel. The service worker
 * is registered here once for the application shell.
 */
export function PwaInstallButton({ mobile = false }: { mobile?: boolean } = {}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    setInstalled(isStandalone())
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
    }
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  async function install(): Promise<void> {
    if (prompt) {
      await prompt.prompt()
      await prompt.userChoice.catch(() => undefined)
      setPrompt(null)
      return
    }
    setHelpOpen((value) => !value)
  }

  return (
    <div className={mobile ? "relative" : "relative hidden sm:block"}>
      <IconButton
        label="نصب برنامه مدیریت"
        aria-expanded={helpOpen}
        onClick={() => void install()}
      >
        <Download className="size-5" aria-hidden="true" />
      </IconButton>
      {helpOpen ? (
        <div
          role="status"
          className={mobile ? "mt-2 rounded-card border border-border bg-surface-strong p-3 text-xs leading-6 text-muted" : "absolute end-0 top-full z-50 mt-2 w-64 rounded-card border border-border bg-surface-strong p-3 text-xs leading-6 text-muted shadow-xl"}
        >
          <button
            type="button"
            aria-label="بستن راهنمای نصب"
            className="absolute end-2 top-2 rounded-control p-1 hover:bg-surface-2"
            onClick={() => setHelpOpen(false)}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
          <p className="font-semibold text-foreground">نصب پنل مدیریت</p>
          <p className="mt-1">
            {isIos()
              ? 'در Safari دکمه اشتراک‌گذاری را بزنید و «افزودن به صفحه اصلی» را انتخاب کنید.'
              : 'از منوی مرورگر گزینه «نصب برنامه» یا «افزودن به صفحه اصلی» را انتخاب کنید.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
