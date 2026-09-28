'use client';

import Link from 'next/link';
import { useCompare } from '@/components/ecommerce/compare/compare-provider';
import { formatFaNumber } from '@/lib/format';

/**
 * Header compare icon (SS-237): always rendered — the compare list is
 * guest-friendly local state, so the surface is real for anonymous visitors
 * too. The badge renders only when the client store is ready and the list is
 * non-empty, so the server paint (no badge) never mismatches hydration.
 */
export function CompareHeaderIcon() {
  const { count, ready } = useCompare();

  return (
    <Link
      href="/compare"
      aria-label={
        ready && count > 0
          ? `مقایسه محصولات، ${formatFaNumber(count)} محصول`
          : 'مقایسه محصولات'
      }
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-600 hover:bg-sabz-50 hover:text-sabz-700"
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
        <path
          d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {ready && count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute end-0 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-sabz-700 px-1 text-[11px] font-bold text-white"
        >
          {formatFaNumber(count)}
        </span>
      ) : null}
    </Link>
  );
}
