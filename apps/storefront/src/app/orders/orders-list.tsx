'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderListItemDto } from '@sabz/types';
import { buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { fetchOrders, orderStatusLabel } from '@/lib/orders';
import { formatFaDate, formatFaNumber, formatToman } from '@/lib/format';

const LOAD_FAILED = 'دریافت سفارش‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'error';

/**
 * Order-history island (SS-233): newest-first list behind the OTP session.
 * Guests are sent to `/login?next=/orders`.
 */
export function OrdersList() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [items, setItems] = useState<OrderListItemDto[]>([]);
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
    fetchOrders()
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
      router.replace('/login?next=/orders');
    }
  }, [status, router]);

  if (status === 'checking' || status === 'loading' || status === 'login') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری سفارش‌ها">
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

  if (items.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm leading-6 text-gray-600">
          هنوز سفارشی ثبت نکرده‌اید.
        </p>
        <Link href="/products" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
          مشاهده محصولات
        </Link>
      </Card>
    );
  }

  return (
    <ul role="list" className="stagger space-y-4">
      {items.map((order) => (
        <li key={order.id}>
          <Card
            hover
            className="group relative overflow-hidden border-sand-200 p-5 transition-colors hover:border-sabz-300"
          >
            {/* Status accent rail (SS-246): the order's state reads from the
                card edge before the badge — color never carries it alone. */}
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 start-0 w-1 ${
                order.status === 'DELIVERED'
                  ? 'bg-sabz-500'
                  : order.status === 'SHIPPED'
                    ? 'bg-amber-500'
                    : order.status === 'CANCELLED'
                      ? 'bg-red-400'
                      : 'bg-sand-200'
              }`}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 ps-3">
              <div>
                <p className="text-sm font-extrabold text-ink-900">
                  سفارش {formatFaNumber(order.orderNumber)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatFaDate(order.createdAt)}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                  order.status === 'DELIVERED'
                    ? 'bg-sabz-50 text-sabz-700 ring-sabz-200'
                    : order.status === 'SHIPPED'
                      ? 'bg-amber-50 text-amber-700 ring-amber-200'
                      : order.status === 'CANCELLED'
                        ? 'bg-red-50 text-red-700 ring-red-100'
                        : 'bg-sand-100 text-gray-600 ring-sand-200'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${
                    order.status === 'DELIVERED'
                      ? 'bg-sabz-500'
                      : order.status === 'SHIPPED'
                        ? 'bg-amber-500'
                        : order.status === 'CANCELLED'
                          ? 'bg-red-400'
                          : 'bg-gray-400'
                  }`}
                />
                {orderStatusLabel(order.status)}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-sand-100 pt-4 ps-3">
              <p className="text-sm text-gray-600">
                <span className="font-bold text-ink-900">{formatFaNumber(order.itemCount)}</span> قلم
                <span className="mx-2 text-sand-200" aria-hidden="true">|</span>
                جمع: <span className="font-extrabold text-sabz-800">{formatToman(order.total)}</span>
              </p>
              <Link
                href={`/orders/${order.id}`}
                className="group inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-sabz-700 ring-1 ring-inset ring-sabz-200 transition-all duration-200 hover:bg-sabz-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
              >
                جزئیات سفارش
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
