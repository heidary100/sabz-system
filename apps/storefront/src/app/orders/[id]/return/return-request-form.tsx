'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDetailDto } from '@sabz/types';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { fetchOrderDetail } from '@/lib/orders';
import { createReturn } from '@/lib/returns';
import { formatFaNumber } from '@/lib/format';

const LOAD_FAILED = 'دریافت جزئیات سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'missing' | 'ineligible' | 'error';

/**
 * Return-request island (SS-242): per-line quantities + reason, filed
 * against an owned DELIVERED order. Guests go to login; foreign ids render
 * the honest missing state; non-DELIVERED orders render the ineligible
 * notice (the API 422s without disclosing more).
 */
export function ReturnRequestForm({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [order, setOrder] = useState<OrderDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        if (detail.status !== 'DELIVERED') {
          setOrder(detail);
          setStatus('ineligible');
          return;
        }
        setOrder(detail);
        const initial: Record<string, number> = {};
        for (const line of detail.items) {
          initial[line.id] = line.quantity;
        }
        setSelected(initial);
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
      router.replace(`/login?next=/orders/${id}/return`);
    }
  }, [status, router, id]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError('دلیل مرجوعی الزامی است.');
      return;
    }
    if (trimmed.length > 1000) {
      setReasonError('دلیل مرجوعی باید حداکثر ۱۰۰۰ کاراکتر باشد.');
      return;
    }
    setReasonError(null);
    const lines = Object.entries(selected)
      .filter(([, quantity]) => quantity > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (lines.length === 0) {
      setSubmitError('حداقل یک قلم برای مرجوعی انتخاب کنید.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = await createReturn({ orderId: id, reason: trimmed, items: lines });
      router.push(`/returns/${created.id}`);
    } catch (submitFailure) {
      setSubmitError(
        submitFailure instanceof ApiError
          ? (submitFailure.payload?.message ?? 'ثبت درخواست مرجوعی ناموفق بود؛ لطفاً دوباره تلاش کنید.')
          : 'ثبت درخواست مرجوعی ناموفق بود؛ لطفاً دوباره تلاش کنید.',
      );
      setSubmitting(false);
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

  if (status === 'ineligible' || (status === 'ready' && order === null)) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm leading-6 text-gray-600">
          فقط سفارش‌های تحویل‌شده در مهلت مرجوعی قابل برگشت هستند.
        </p>
        <Link href={`/orders/${id}`} className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
          بازگشت به سفارش
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

  const toggleLine = (lineId: string, max: number): void => {
    setSelected((prev) => ({
      ...prev,
      [lineId]: (prev[lineId] ?? 0) > 0 ? 0 : max,
    }));
  };

  const setQuantity = (lineId: string, max: number, next: number): void => {
    const clamped = Math.max(0, Math.min(max, Math.floor(next)));
    setSelected((prev) => ({ ...prev, [lineId]: clamped }));
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
      <Card className="p-6">
        <h2 className="text-sm font-bold text-ink-900">
          اقلام سفارش {formatFaNumber(order.orderNumber)}
        </h2>
        <ul role="list" className="mt-3 space-y-3 text-sm">
          {order.items.map((line) => {
            const quantity = selected[line.id] ?? 0;
            return (
              <li key={line.id} className="flex items-center justify-between gap-3 border-b border-sand-100 pb-3 last:border-0">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 leading-6 text-gray-600">
                  <input
                    type="checkbox"
                    checked={quantity > 0}
                    disabled={submitting}
                    onChange={() => toggleLine(line.id, line.quantity)}
                    className="mt-1.5 size-4 shrink-0 accent-sabz-700"
                  />
                  <span>
                    {line.productName}
                    {line.variantName !== null ? ` — ${line.variantName}` : ''}
                    <span className="block text-xs text-gray-400">
                      {line.sku} — حداکثر {formatFaNumber(line.quantity)} عدد
                    </span>
                  </span>
                </label>
                {quantity > 0 ? (
                  <span className="flex shrink-0 items-center gap-2" dir="ltr">
                    <button
                      type="button"
                      aria-label="کاهش تعداد"
                      disabled={submitting || quantity <= 1}
                      onClick={() => setQuantity(line.id, line.quantity, quantity - 1)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-full ring-1 ring-inset ring-sand-200 transition-colors hover:bg-sand-100 disabled:opacity-40"
                    >
                      −
                    </button>
                    <span aria-live="polite" className="w-6 text-center font-bold text-ink-900">
                      {formatFaNumber(quantity)}
                    </span>
                    <button
                      type="button"
                      aria-label="افزایش تعداد"
                      disabled={submitting || quantity >= line.quantity}
                      onClick={() => setQuantity(line.id, line.quantity, quantity + 1)}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-full ring-1 ring-inset ring-sand-200 transition-colors hover:bg-sand-100 disabled:opacity-40"
                    >
                      +
                    </button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-6">
        <label htmlFor="return-reason" className="text-sm font-bold text-ink-900">
          دلیل مرجوعی
        </label>
        <textarea
          id="return-reason"
          value={reason}
          disabled={submitting}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="لطفاً دلیل برگشت کالا را بنویسید…"
          className="mt-2 w-full rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm leading-6 text-ink-900 placeholder:text-gray-400 focus:border-sabz-500 focus:outline-none"
        />
        {reasonError !== null ? (
          <p role="alert" className="mt-2 text-xs text-red-700">{reasonError}</p>
        ) : null}
      </Card>

      {submitError !== null ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'در حال ثبت…' : 'ثبت درخواست مرجوعی'}
        </Button>
        <Link href={`/orders/${id}`} className={buttonVariants({ variant: 'ghost' })}>
          انصراف
        </Link>
      </div>
    </form>
  );
}
