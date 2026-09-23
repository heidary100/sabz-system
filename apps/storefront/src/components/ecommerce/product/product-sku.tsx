'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Variant SKU with an accessible copy control (SS-214).
 *
 * The identifier itself stays `dir="ltr"` inside Persian-first UI. Feedback
 * is a polite live-region text («کپی شد») plus an icon swap — never
 * color-only, no toast library. Clipboard failures stay silent (no fake
 * success signal).
 */
export function ProductSku({ sku }: { sku: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sku);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <dt className="text-gray-600">شناسه کالا</dt>
      <dd className="flex items-center gap-1.5">
        <span dir="ltr" className="font-mono text-[13px] text-ink-900">
          {sku}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="کپی شناسه کالا"
          className="rounded-md p-1.5 text-gray-500 ring-sabz-600 hover:bg-sand-100 hover:text-sabz-700 focus-visible:ring-2 focus-visible:outline-none"
        >
          {copied ? (
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true" className="size-4">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25"
              />
            </svg>
          )}
        </button>
        <span aria-live="polite" className="min-w-12 text-xs text-sabz-700">
          {copied ? 'کپی شد' : null}
        </span>
      </dd>
    </div>
  );
}
