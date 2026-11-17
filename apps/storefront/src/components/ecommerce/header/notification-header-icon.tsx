'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useHasSession } from '@/components/ecommerce/wishlist/use-has-session';
import { fetchUnreadCount } from '@/lib/notifications';
import { formatFaNumber } from '@/lib/format';

/**
 * Header notification bell (SS-243): hidden when logged out
 * (anti-fabrication — no fake commerce UI for anonymous visitors). Shows
 * the live unread count as a badge; failures degrade to a badge-less bell.
 */
export function NotificationHeaderIcon() {
  const visible = useHasSession();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    fetchUnreadCount()
      .then((count) => {
        if (!cancelled) {
          setUnread(count.unread);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnread(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <Link
      href="/notifications"
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-control p-2 text-fg-secondary hover:bg-accent-soft hover:text-accent"
    >
      <span className="sr-only">اعلان‌ها</span>
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
        <path
          d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {unread !== null && unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -start-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-sale px-1 text-[11px] font-bold text-on-sale"
        >
          {formatFaNumber(unread > 99 ? 99 : unread)}
        </span>
      )}
    </Link>
  );
}
