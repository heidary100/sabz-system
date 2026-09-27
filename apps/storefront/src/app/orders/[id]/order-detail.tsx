'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDetailDto } from '@sabz/types';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Badge } from '@/components/ecommerce/ui/badge';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { cancelOrder, fetchOrderDetail, orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from '@/lib/orders';
import { formatFaNumber, formatToman } from '@/lib/format';
import { OrderTimeline } from './order-timeline';

const LOAD_FAILED = 'دریافت جزئیات سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CANCEL_FAILED = 'لغو سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'missing' | 'error';

/**
 * Order-detail island (SS-233): snapshot lines, address snapshot, status
 * timeline, invoice link, and PENDING-only cancel. Guests go to login;
 * foreign ids render the honest missing state (the API 404s without
 * disclosing ownership).
 */
export function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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
    fetchOrderDetail(id)
      .then((detail) => {
        if (cancelled) {
          return;
        }
        setOrder(detail);
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
        if (loadError instanceof ApiError && loadError.status === 404) {
          setStatus('missing');
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
  }, [id]);

  useEffect(() => {
    if (status === 'login') {
      router.replace(`/login?next=/orders/${id}`);
    }
  }, [status, router, id]);

  async function handleCancel(): Promise<void> {
    setCancelling(true);
    setCancelError(null);
    try {
      const detail = await cancelOrder(id);
      setOrder(detail);
    } catch (cancelFailure) {
      setCancelError(
        cancelFailure instanceof ApiError
          ? (cancelFailure.payload?.message ?? CANCEL_FAILED)
          : CANCEL_FAILED,
      );
    } finally {
      setCancelling(false);
    }
  }

  if (status === 'checking' || status === 'loading' || status === 'login') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری سفارش">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm leading-6 text-gray-600">سفارش یافت نشد.</p>
        <Link href="/orders" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
          بازگشت به سفارش‌ها
        </Link>
      </Card>
    );
  }

  if (status === 'error' || order === null) {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? LOAD_FAILED}
      </p>
    );
  }

  const snapshot = order.addressSnapshot;
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink-900">
              سفارش {formatFaNumber(order.orderNumber)}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {paymentMethodLabel(order.paymentMethod)} — {paymentStatusLabel(order.paymentStatus)} — جمع {formatToman(order.total)}
            </p>
          </div>
          <Badge variant={order.status === 'CANCELLED' ? 'outOfStock' : order.status === 'DELIVERED' ? 'success' : 'neutral'}>
            {orderStatusLabel(order.status)}
          </Badge>
        </div>
        <div className="mt-4">
          <OrderTimeline status={order.status} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-bold text-ink-900">اقلام سفارش</h2>
        <ul role="list" className="mt-3 space-y-3 text-sm">
          {order.items.map((item, index) => (
            <li key={`${item.variantId}-${index}`} className="flex items-start justify-between gap-3 border-b border-sand-100 pb-3 last:border-0">
              <span className="leading-6 text-gray-600">
                {item.productName}
                {item.variantName !== null ? ` — ${item.variantName}` : ''}
                <span className="block text-xs text-gray-400">
                  {item.sku} × {formatFaNumber(item.quantity)}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-ink-900">
                {formatToman(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-2 border-t border-sand-200 pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-gray-600">هزینه ارسال</dt>
            <dd className="font-semibold text-ink-900">{formatToman(order.shippingFee)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="font-semibold text-ink-900">جمع سفارش</dt>
            <dd aria-live="polite" className="text-lg font-bold text-sabz-800">
              {formatToman(order.total)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-bold text-ink-900">نشانی تحویل</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {snapshot.fullName} — <span dir="ltr">{snapshot.phone}</span>
          <br />
          {[snapshot.province, snapshot.city, snapshot.address].filter(Boolean).join('، ')}
          {snapshot.postalCode !== null ? ` — کد پستی ${snapshot.postalCode}` : ''}
        </p>
      </Card>

      {cancelError !== null ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {cancelError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link href={`/orders/${order.id}/invoice`} className={buttonVariants({ variant: 'outline' })}>
          چاپ فاکتور
        </Link>
        {order.status === 'PENDING' ? (
          <Button variant="ghost" disabled={cancelling} onClick={() => void handleCancel()} className="text-red-700 hover:bg-red-50 hover:text-red-700">
            {cancelling ? 'در حال لغو…' : 'لغو سفارش'}
          </Button>
        ) : null}
        <Link href="/orders" className={buttonVariants({ variant: 'ghost' })}>
          بازگشت به سفارش‌ها
        </Link>
      </div>
    </div>
  );
}
