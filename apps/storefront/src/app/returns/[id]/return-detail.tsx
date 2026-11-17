'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReturnRequestDto } from '@sabz/types';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Badge } from '@/components/ecommerce/ui/badge';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { cancelReturn, fetchReturnDetail, returnStatusLabel } from '@/lib/returns';
import { formatFaDate, formatFaNumber } from '@/lib/format';

const LOAD_FAILED = 'دریافت جزئیات مرجوعی ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const CANCEL_FAILED = 'لغو درخواست مرجوعی ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'missing' | 'error';

/**
 * Return-detail island (SS-242): lines, reason trail, and PENDING-only
 * cancel. Guests go to login; foreign ids render the honest missing state
 * (the API 404s without disclosing ownership).
 */
export function ReturnDetail({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState<ReturnRequestDto | null>(null);
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
    fetchReturnDetail(id)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setDetail(data);
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
      router.replace(`/login?next=/returns/${id}`);
    }
  }, [status, router, id]);

  async function handleCancel(): Promise<void> {
    setCancelling(true);
    setCancelError(null);
    try {
      const updated = await cancelReturn(id);
      setDetail(updated);
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
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری مرجوعی">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm leading-6 text-fg-secondary">درخواست مرجوعی یافت نشد.</p>
        <Link href="/returns" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
          بازگشت به مرجوعی‌ها
        </Link>
      </Card>
    );
  }

  if (status === 'error' || detail === null) {
    return (
      <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
        {error ?? LOAD_FAILED}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-fg">
              مرجوعی سفارش {formatFaNumber(detail.orderNumber)}
            </h2>
            <p className="mt-1 text-xs text-fg-muted">
              ثبت {formatFaDate(detail.createdAt)}
            </p>
          </div>
          <Badge
            variant={
              detail.status === 'COMPLETED'
                ? 'success'
                : detail.status === 'REJECTED' || detail.status === 'CANCELLED'
                  ? 'outOfStock'
                  : 'neutral'
            }
          >
            {returnStatusLabel(detail.status)}
          </Badge>
        </div>
        <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
          <div>
            <dt className="font-semibold text-fg">دلیل مرجوعی</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-6 text-fg-secondary">
              {detail.reason}
            </dd>
          </div>
          {detail.rejectReason !== null ? (
            <div>
              <dt className="font-semibold text-fg">دلیل رد</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-6 text-fg-secondary">
                {detail.rejectReason}
              </dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-bold text-fg">اقلام مرجوعی</h2>
        <ul role="list" className="mt-3 space-y-3 text-sm">
          {detail.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0">
              <span className="leading-6 text-fg-secondary">
                {item.productName}
                {item.variantName !== null ? ` — ${item.variantName}` : ''}
                <span className="block text-xs text-fg-muted">
                  {item.sku} × {formatFaNumber(item.quantity)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {cancelError !== null ? (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {cancelError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link href={`/orders/${detail.orderId}`} className={buttonVariants({ variant: 'outline' })}>
          مشاهده سفارش
        </Link>
        {detail.status === 'PENDING' ? (
          <Button variant="ghost" disabled={cancelling} onClick={() => void handleCancel()} className="text-danger hover:bg-danger-soft hover:text-danger">
            {cancelling ? 'در حال لغو…' : 'لغو درخواست'}
          </Button>
        ) : null}
        <Link href="/returns" className={buttonVariants({ variant: 'ghost' })}>
          بازگشت به مرجوعی‌ها
        </Link>
      </div>
    </div>
  );
}
