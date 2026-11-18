'use client';

import { useState, useSyncExternalStore } from 'react';
import { shareTextWithoutUrl, type ProductSharePayload } from '@/lib/share-message';

const unsubscribeNoop = () => undefined;
function subscribeNoop(): () => void {
  return unsubscribeNoop;
}
function hasNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Social share row (SS-227): parity with the live site's share links
 * (Telegram, WhatsApp, X, Facebook, Pinterest, LinkedIn) plus a copy-link
 * button. Client component — the copy actions need clipboard access; the
 * share links themselves are plain anchors built from the canonical URL.
 *
 * SS-249: when `shareText` is provided (product pages), Telegram and
 * WhatsApp carry the composed Persian payload (title/brand/public price) and
 * the Bale action copies it. Blog pages omit `shareText` and share the bare
 * URL. Bale publishes no web share deep-link (verified 2026-10-24 against
 * docs.bale.ai — only bot/channel links exist), so its action always copies
 * for pasting into a Bale chat. No endpoint is invented.
 */
export function ProductShare({
  canonicalUrl,
  shareText,
  sharePayload,
}: {
  canonicalUrl: string;
  shareText?: string;
  sharePayload?: ProductSharePayload;
}) {
  const text = sharePayload?.text ?? shareText;
  const title = sharePayload?.title;
  const imageUrl = sharePayload?.imageUrl ?? null;
  const [copied, setCopied] = useState<'link' | 'bale' | null>(null);
  const [nativeState, setNativeState] = useState<'idle' | 'sharing' | 'unsupported'>('idle');
  // Server and pre-hydration renders must agree; capability detection is a
  // client-only enhancement, not part of the SSR markup.
  const canNativeShare = useSyncExternalStore(subscribeNoop, hasNativeShare, () => false);
  const url = encodeURIComponent(canonicalUrl);

  // Telegram renders its `url` parameter as the shared link, so the text
  // parameter drops the trailing URL line to avoid duplication. WhatsApp has
  // a single text parameter, so the full message (URL included) goes there.
  const telegramText = text
    ? `&text=${encodeURIComponent(shareTextWithoutUrl(text, canonicalUrl))}`
    : '';
  const whatsappText = encodeURIComponent(text ?? canonicalUrl);

  const links = [
    { label: 'تلگرام', href: `https://t.me/share/url?url=${url}${telegramText}` },
    { label: 'واتساپ', href: `https://wa.me/?text=${whatsappText}` },
    { label: 'ایکس', href: `https://x.com/share?url=${url}` },
    { label: 'فیس‌بوک', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { label: 'پینترست', href: `https://pinterest.com/pin/create/button/?url=${url}` },
    { label: 'لینکدین', href: `https://www.linkedin.com/shareArticle?mini=true&url=${url}` },
  ];

  async function copy(target: 'link' | 'bale') {
    try {
      await navigator.clipboard.writeText(
        target === 'bale' && text ? text : canonicalUrl,
      );
      setCopied(target);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard denied (permissions/insecure context): silently no-op,
      // the share links remain the fallback.
    }
  }

  async function nativeShare() {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      setNativeState('unsupported')
      return
    }
    setNativeState('sharing')
    try {
      const data: ShareData = {
        title: title ?? undefined,
        text: text ?? undefined,
        url: canonicalUrl,
      }
      if (imageUrl) {
        try {
          const response = await fetch(imageUrl)
          if (response.ok) {
            const blob = await response.blob()
            const extension = blob.type.includes('png') ? 'png' : 'jpg'
            const file = new File([blob], `product.${extension}`, { type: blob.type })
            if (navigator.canShare?.({ files: [file] })) {
              data.files = [file]
            }
          }
        } catch {
          // Image fetch blocked: the text/url share still proceeds.
        }
      }
      await navigator.share(data)
      setNativeState('idle')
    } catch (error) {
      setNativeState('idle')
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        // Native share is an enhancement; anchors/copy remain available.
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-fg-muted">اشتراک‌گذاری:</span>
      {canNativeShare && nativeState !== 'unsupported' ? (
        <button
          type="button"
          onClick={() => void nativeShare()}
          disabled={nativeState === 'sharing'}
          className="inline-flex min-h-9 items-center rounded-pill border border-accent bg-accent-soft px-3 text-xs font-medium text-accent transition-colors hover:border-accent hover:text-accent-hover disabled:opacity-60"
        >
          {nativeState === 'sharing' ? 'در حال اشتراک…' : 'اشتراک‌گذاری…'}
        </button>
      ) : null}
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center rounded-pill border border-border bg-surface px-3 text-xs text-fg-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {link.label}
          <span className="sr-only"> (باز شدن در پنجره جدید)</span>
        </a>
      ))}
      <button
        type="button"
        onClick={() => copy('bale')}
        title="بله پیوند اشتراک‌گذاری مستقیم ندارد؛ پیام برای ارسال در بله کپی می‌شود"
        className="inline-flex min-h-9 items-center rounded-pill border border-border bg-surface px-3 text-xs text-fg-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {copied === 'bale' ? 'کپی شد ✓' : 'بله'}
        <span className="sr-only"> (کپی پیام برای اشتراک در بله)</span>
      </button>
      <button
        type="button"
        onClick={() => copy('link')}
        className="inline-flex min-h-9 items-center rounded-pill border border-border bg-surface px-3 text-xs text-fg-secondary transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {copied === 'link' ? 'کپی شد ✓' : 'کپی لینک'}
      </button>
    </div>
  );
}
