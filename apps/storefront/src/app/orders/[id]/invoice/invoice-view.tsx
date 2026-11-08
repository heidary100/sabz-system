'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvoiceDto } from '@sabz/types';
import { buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { fetchInvoice, orderStatusLabel, paymentMethodLabel, paymentStatusLabel } from '@/lib/orders';
import { formatFaNumber, formatToman } from '@/lib/format';

const LOAD_FAILED = 'دریافت فاکتور ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'missing' | 'error';

/**
 * Invoice print view (SS-233 v1): HTML print route over
 * `GET /orders/:id/invoice` — no PDF dependency. Print styles hide the
 * surrounding chrome; the invoice card itself is print-clean RTL.
 */
export function InvoiceView({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
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
    fetchInvoice(id)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setInvoice(data);
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
      router.replace(`/login?next=/orders/${id}/invoice`);
    }
  }, [status, router, id]);

  if (status === 'checking' || status === 'loading' || status === 'login') {
    return (
      <div className="space-y-4 print:hidden" aria-busy="true" aria-label="در حال بارگذاری فاکتور">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'missing') {
    return (
      <Card className="p-6 text-center print:hidden">
        <p className="text-sm leading-6 text-fg-secondary">فاکتور یافت نشد.</p>
        <Link href="/orders" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
          بازگشت به سفارش‌ها
        </Link>
      </Card>
    );
  }

  if (status === 'error' || invoice === null) {
    return (
      <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger print:hidden">
        {error ?? LOAD_FAILED}
      </p>
    );
  }

  const snapshot = invoice.addressSnapshot;
  return (
    <div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className={buttonVariants({ variant: 'primary' })}
        >
          چاپ فاکتور
        </button>
        <Link href={`/orders/${invoice.id}`} className={buttonVariants({ variant: 'ghost' })}>
          بازگشت به سفارش
        </Link>
      </div>

      <div className="mt-6 rounded-card border border-border bg-surface p-6 print:mt-0 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-bold text-fg">فاکتور فروش</h2>
            <p className="mt-1 text-sm text-fg-secondary">
              شماره سفارش {formatFaNumber(invoice.orderNumber)}
            </p>
          </div>
          <div className="text-left text-sm text-fg-secondary">
            <p>وضعیت: {orderStatusLabel(invoice.status)}</p>
            <p>
              شیوه پرداخت: {paymentMethodLabel(invoice.paymentMethod)} — {paymentStatusLabel(invoice.paymentStatus)}
            </p>
            <p>
              تحویل‌گیرنده: {snapshot.fullName} — <span dir="ltr">{snapshot.phone}</span>
            </p>
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-fg-muted">
              <th scope="col" className="py-2 font-semibold">شرح</th>
              <th scope="col" className="py-2 font-semibold">تعداد</th>
              <th scope="col" className="py-2 font-semibold">مبلغ واحد</th>
              <th scope="col" className="py-2 font-semibold">مبلغ کل</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={`${item.variantId}-${index}`} className="border-b border-border last:border-0">
                <td className="py-2 text-fg">
                  {item.productName}
                  {item.variantName !== null ? ` — ${item.variantName}` : ''}
                  <span className="block text-xs text-fg-muted">{item.sku}</span>
                </td>
                <td className="py-2">{formatFaNumber(item.quantity)}</td>
                <td className="py-2">{formatToman(item.unitPrice)}</td>
                <td className="py-2 font-semibold">{formatToman(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-secondary">جمع اقلام</dt>
            <dd className="font-semibold text-fg">{formatToman(invoice.subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-secondary">هزینه ارسال</dt>
            <dd className="font-semibold text-fg">{formatToman(invoice.shippingFee)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="font-bold text-fg">جمع فاکتور</dt>
            <dd className="text-lg font-bold text-accent-hover">{formatToman(invoice.total)}</dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-5 text-fg-muted">
          نشانی تحویل: {[snapshot.province, snapshot.city, snapshot.address].filter(Boolean).join('، ')}
          {snapshot.postalCode !== null ? ` — کد پستی ${snapshot.postalCode}` : ''}
        </p>
      </div>
    </div>
  );
}
