'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReturnRequestDto } from '@sabz/types';
import { buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Badge } from '@/components/ecommerce/ui/badge';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { fetchReturns, returnStatusLabel } from '@/lib/returns';
import { formatFaDate, formatFaNumber } from '@/lib/format';

const LOAD_FAILED = 'دریافت مرجوعی‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'error';

/**
 * Return-history island (SS-242): newest-first list behind the OTP session.
 * Guests are sent to `/login?next=/returns`.
 */
export function ReturnsList() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [items, setItems] = useState<ReturnRequestDto[]>([]);
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
    fetchReturns()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setItems(list.items);
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
  }, []);

  useEffect(() => {
    if (status === 'login') {
      router.replace('/login?next=/returns');
    }
  }, [status, router]);

  if (status === 'checking' || status === 'loading' || status === 'login') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری مرجوعی‌ها">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
        {error ?? LOAD_FAILED}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm leading-6 text-fg-secondary">
          هنوز درخواست مرجوعی ثبت نکرده‌اید.
        </p>
        <Link href="/orders" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
          مشاهده سفارش‌ها
        </Link>
      </Card>
    );
  }

  return (
    <ul role="list" className=" space-y-4">
      {items.map((item) => (
        <li key={item.id}>
          <Card hover className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-fg">
                  مرجوعی سفارش {formatFaNumber(item.orderNumber)}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  {formatFaDate(item.createdAt)} — {item.items.length} قلم
                </p>
              </div>
              <Badge
                variant={
                  item.status === 'COMPLETED'
                    ? 'success'
                    : item.status === 'REJECTED' || item.status === 'CANCELLED'
                      ? 'outOfStock'
                      : 'neutral'
                }
              >
                {returnStatusLabel(item.status)}
              </Badge>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-fg-secondary">
              {item.reason}
            </p>
            <div className="mt-4 flex justify-end border-t border-border pt-4">
              <Link
                href={`/returns/${item.id}`}
                className="group inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-surface px-4 text-sm font-semibold text-accent ring-1 ring-inset ring-accent/20 transition-all duration-200 hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                جزئیات درخواست
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                  className="size-4 transition-transform duration-300 ease-[var(--ease-swift)] group-hover:-translate-x-0.5"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
