'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderListItemDto } from '@sabz/types';
import { buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Badge } from '@/components/ecommerce/ui/badge';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { fetchOrders, orderStatusLabel } from '@/lib/orders';
import { formatFaNumber, formatToman } from '@/lib/format';

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
    <ul role="list" className="space-y-4">
      {items.map((order) => (
        <li key={order.id}>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink-900">
                  سفارش {formatFaNumber(order.orderNumber)}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {formatFaNumber(order.itemCount)} قلم — {formatToman(order.total)}
                </p>
              </div>
              <Badge variant={order.status === 'CANCELLED' ? 'outOfStock' : order.status === 'DELIVERED' ? 'success' : 'neutral'}>
                {orderStatusLabel(order.status)}
              </Badge>
            </div>
            <div className="mt-4">
              <Link
                href={`/orders/${order.id}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                جزئیات سفارش
              </Link>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
