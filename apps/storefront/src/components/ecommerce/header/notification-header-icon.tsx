'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useHasSession } from '@/components/ecommerce/wishlist/use-has-session';
import {
  notificationCountLabel,
  useStoreNotifications,
} from '@/components/ecommerce/notifications/notification-provider';
import { formatFaDateTime } from '@/lib/format';

/**
 * Storefront notification bell (SS-243/SS-900): live unread counter and a
 * purpose-built popover, not a table. Hidden when logged out. The provider
 * owns delivery/reconciliation; this component only renders and marks read.
 */
export function NotificationHeaderIcon() {
  const visible = useHasSession();
  const {
    items,
    unread,
    connected,
    markRead,
    markAllRead,
    refresh,
  } = useStoreNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!visible) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void refresh();
        }}
        aria-label={unread > 0 ? `اعلان‌ها، ${unread} خوانده‌نشده` : 'اعلان‌ها'}
        aria-expanded={open}
        aria-haspopup="dialog"
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
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -start-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-sale px-1 text-[11px] font-bold text-on-sale"
          >
            {notificationCountLabel(unread)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="اعلان‌ها"
          className="absolute end-0 top-full z-50 mt-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-panel border border-border bg-surface shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-bold text-fg">اعلان‌ها</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-muted">
                <span className={`size-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-warning'}`} aria-hidden="true" />
                {connected ? 'زنده' : 'اتصال مجدد'} {unread > 0 ? `— ${notificationCountLabel(unread)} خوانده‌نشده` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unread === 0}
              className="text-xs font-semibold text-accent hover:underline disabled:opacity-40"
            >
              همه خوانده شد
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-fg-muted">اعلانی ندارید.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.slice(0, 8).map((item) => {
                  const href =
                    item.entity === 'Order'
                      ? `/orders/${item.entityId}`
                      : item.entity === 'ReturnRequest'
                        ? `/returns/${item.entityId}`
                        : item.entity === 'Rfq'
                          ? `/rfq/${item.entityId}`
                          : '/notifications';
                  return (
                    <li key={item.id}>
                      <Link
                        href={href ?? '/notifications'}
                        onClick={() => {
                          if (item.readAt === null) void markRead(item.id);
                          setOpen(false);
                        }}
                        className="block px-4 py-3 transition-colors hover:bg-surface-2"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 size-2 shrink-0 rounded-full ${
                              item.readAt === null ? 'bg-accent' : 'bg-transparent'
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className={`text-sm ${item.readAt === null ? 'font-bold text-fg' : 'font-medium text-fg'}`}>
                              {item.title}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-fg-secondary">{item.body}</p>
                            <p className="mt-1 text-[10px] text-fg-muted">{formatFaDateTime(item.createdAt)}</p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-accent hover:bg-surface-2"
          >
            مرکز اعلان‌ها
          </Link>
        </div>
      )}
    </div>
  );
}
