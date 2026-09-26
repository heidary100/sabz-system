'use client';

import Link from 'next/link';
import { useHasSession } from '@/components/ecommerce/wishlist/use-has-session';

/**
 * Header wishlist icon (SS-231): hidden when logged out (anti-fabrication —
 * no fake commerce UI for anonymous visitors). Badge-less by design: the
 * count is private per-user state with no cached read path.
 */
export function WishlistHeaderIcon() {
  const visible = useHasSession();

  if (!visible) {
    return null;
  }

  return (
    <Link
      href="/wishlist"
      className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-600 hover:bg-sabz-50 hover:text-sabz-700"
    >
      <span className="sr-only">علاقه‌مندی‌ها</span>
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
        <path
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
