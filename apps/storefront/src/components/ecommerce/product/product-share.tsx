'use client';

import { useState } from 'react';

/**
 * Social share row (SS-227): parity with the live site's share links
 * (Telegram, WhatsApp, X, Facebook, Pinterest, LinkedIn) plus a copy-link
 * button. Client component — the copy action needs clipboard access; the
 * share links themselves are plain anchors built from the canonical URL.
 */
export function ProductShare({ canonicalUrl }: { canonicalUrl: string }) {
  const [copied, setCopied] = useState(false);
  const url = encodeURIComponent(canonicalUrl);

  const links = [
    { label: 'تلگرام', href: `https://t.me/share/url?url=${url}` },
    { label: 'واتساپ', href: `https://wa.me/?text=${url}` },
    { label: 'ایکس', href: `https://x.com/share?url=${url}` },
    { label: 'فیس‌بوک', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { label: 'پینترست', href: `https://pinterest.com/pin/create/button/?url=${url}` },
    { label: 'لینکدین', href: `https://www.linkedin.com/shareArticle?mini=true&url=${url}` },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (permissions/insecure context): silently no-op,
      // the share links remain the fallback.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-gray-500">اشتراک‌گذاری:</span>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center rounded-full border border-sand-200 bg-white px-3 text-xs text-gray-600 transition-colors hover:border-sabz-300 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
        >
          {link.label}
          <span className="sr-only"> (باز شدن در پنجره جدید)</span>
        </a>
      ))}
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex min-h-9 items-center rounded-full border border-sand-200 bg-white px-3 text-xs text-gray-600 transition-colors hover:border-sabz-300 hover:text-sabz-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
      >
        {copied ? 'کپی شد ✓' : 'کپی لینک'}
      </button>
    </div>
  );
}
