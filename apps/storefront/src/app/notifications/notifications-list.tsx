'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NotificationDto } from '@sabz/types';
import { buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Badge } from '@/components/ecommerce/ui/badge';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import {
  fetchNotifications,
  markNotificationRead,
  notificationTypeLabel,
} from '@/lib/notifications';
import { formatFaDate, formatFaNumber } from '@/lib/format';

const LOAD_FAILED = 'دریافت اعلان‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'error';

function entityHref(item: NotificationDto): string | null {
  if (!item.entity || !item.entityId) {
    return null;
  }
  switch (item.entity) {
    case 'Order':
      return `/orders/${item.entityId}`;
    case 'ReturnRequest':
      return `/returns/${item.entityId}`;
    case 'Rfq':
      return `/rfq/${item.entityId}`;
    default:
      return null;
  }
}

/**
 * Notification-history island (SS-243): newest-first list behind the OTP
 * session. Guests are sent to `/login?next=/notifications`.
 */
export function NotificationsList() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Session lives in localStorage (client only): the gate below must run
    // post-hydration. Intentional external sync, not derived state.
    if (!hasSession()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('login');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    fetchNotifications(unreadOnly || undefined)
      .then((list) => {
        if (cancelled) {
          return;
        }
        setItems(list.items);
        setTotal(list.total);
        setStatus('ready');
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        if (loadError instanceof ApiError && loadError.status === 401) {
          setStatus('login');
          return;
        }
        setError(
          loadError instanceof ApiError
            ? (loadError.payload?.message ?? LOAD_FAILED)
            : LOAD_FAILED,
        );
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [unreadOnly]);

  useEffect(() => {
    if (status === 'login') {
      router.replace('/login?next=/notifications');
    }
  }, [status, router]);

  async function handleMarkRead(id: string): Promise<void> {
    setMarkingId(id);
    try {
      const updated = await markNotificationRead(id);
      setItems((prev) =>
        unreadOnly
          ? prev.filter((item) => item.id !== id)
          : prev.map((item) => (item.id === id ? updated : item)),
      );
      setTotal((prev) => (unreadOnly ? Math.max(0, prev - 1) : prev));
    } catch {
      setError(LOAD_FAILED);
    } finally {
      setMarkingId(null);
    }
  }

  if (status === 'checking' || status === 'loading' || status === 'login') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری اعلان‌ها">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? LOAD_FAILED}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setUnreadOnly(true)}
          aria-pressed={unreadOnly}
          className={
            unreadOnly
              ? buttonVariants({ variant: 'primary', size: 'sm' })
              : buttonVariants({ variant: 'outline', size: 'sm' })
          }
        >
          خوانده‌نشده‌ها
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly(false)}
          aria-pressed={!unreadOnly}
          className={
            !unreadOnly
              ? buttonVariants({ variant: 'primary', size: 'sm' })
              : buttonVariants({ variant: 'outline', size: 'sm' })
          }
        >
          همه ({formatFaNumber(total)})
        </button>
      </div>

      {items.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-sm leading-6 text-gray-600">
            {unreadOnly
              ? 'اعلان خوانده‌نشده‌ای ندارید.'
              : 'تاکنون اعلانی برای شما ثبت نشده است.'}
          </p>
          <Link href="/orders" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
            مشاهده سفارش‌ها
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const href = entityHref(item);
            const isUnread = item.readAt === null;
            return (
              <li key={item.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isUnread ? 'success' : 'neutral'}>
                      {notificationTypeLabel(item.type)}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {formatFaDate(item.createdAt)}
                    </span>
                  </div>
                  <p
                    className={
                      isUnread
                        ? 'mt-2 text-sm font-bold text-ink-900'
                        : 'mt-2 text-sm font-semibold text-ink-900'
                    }
                  >
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-gray-600">{item.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {href && (
                      <Link
                        href={href}
                        className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      >
                        مشاهده جزئیات
                      </Link>
                    )}
                    {isUnread && (
                      <button
                        type="button"
                        disabled={markingId === item.id}
                        onClick={() => void handleMarkRead(item.id)}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        {markingId === item.id ? 'در حال ثبت…' : 'خوانده شد'}
                      </button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
