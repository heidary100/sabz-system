import type { ReactNode } from 'react';
import type { TrustItem, TrustItemIcon } from '@/config/home';

/**
 * Trust strip (SS-215). Renders ONLY explicitly configured company claims —
 * never derived from per-product warranty fields, stock metadata, or import
 * columns. With the safe defaults (`trustItems: []`) this returns null and
 * the home page shows no trust section at all.
 */

const TRUST_ICONS: Record<TrustItemIcon, ReactNode> = {
  shield: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
      <path
        d="M9 12.75 11.25 15 15 9.75m-1.5-5.036A11.959 11.959 0 0 1 12 3c-2.114 0-4.198.152-6.03.57-1.265.282-2.47.585-2.47 1.43v11.501c0 2.042 1.135 3.923 2.908 4.86l3.593 1.914a1.125 1.125 0 0 0 1.055 0l3.594-1.914c1.773-.937 2.907-2.818 2.907-4.86V5c0-.845-1.205-1.148-2.47-1.43A11.959 11.959 0 0 1 13.5 3.964"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
      <path
        d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  badge: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
      <path
        d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
      <path
        d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export function TrustStrip({ items }: { items: TrustItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="trust-heading"
      className="border-t border-sand-200 bg-white"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 id="trust-heading" className="sr-only">
          چرا سبز سیستم
        </h2>
        <ul
          role="list"
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {items.map((item) => (
            <li
              key={item.title}
              className="flex items-start gap-3 rounded-xl border border-sand-200 bg-sand-50 p-4"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sabz-50 text-sabz-700">
                {TRUST_ICONS[item.icon]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink-900">
                  {item.title}
                </span>
                {item.body ? (
                  <span className="mt-1 block text-[13px] leading-6 text-gray-600">
                    {item.body}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
