'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AddressDto } from '@sabz/types';
import type {
  PaymentMethod,
  PaymentMethodDto,
  RfqDto,
  ShippingMethodCode,
  ShippingMethodDto,
} from '@sabz/types';
import { AddressPicker } from '@/components/ecommerce/checkout/address-picker';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { Badge } from '@/components/ecommerce/ui/badge';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import { defaultAddress, fetchAddresses } from '@/lib/addresses';
import { hasSession } from '@/lib/auth-client';
import {
  defaultPaymentMethod,
  defaultShippingMethod,
  fetchPaymentMethods,
  fetchShippingMethods,
  isShippingEnabled,
} from '@/lib/checkout';
import { rialToTomanString } from '@/lib/currency';
import { formatFaNumber, formatToman } from '@/lib/format';
import { acceptRfq, fetchRfqDetail, rfqStatusLabel } from '@/lib/rfq';

const LOAD_FAILED = 'دریافت جزئیات استعلام ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const ACCEPT_FAILED = 'پذیرش استعلام ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'error';

/**
 * RFQ detail island (SS-235 B2): quotation state plus the owner accept
 * form (address + payment → POST accept → order page). Quoted rows show
 * the agreed Toman price and the acceptance countdown; accepted rows
 * link to the order; terminal rows explain themselves in Persian.
 */
export function RfqDetail({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [rfq, setRfq] = useState<RfqDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDto[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodDto[]>([]);
  const [shippingMethod, setShippingMethod] = useState<ShippingMethodCode | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('login');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    Promise.all([
      fetchRfqDetail(id),
      fetchAddresses(),
      fetchPaymentMethods(),
      fetchShippingMethods(),
    ])
      .then(([detail, addressRows, methods, ships]) => {
        if (cancelled) {
          return;
        }
        setRfq(detail);
        setAddresses(addressRows);
        setAddressId(defaultAddress(addressRows)?.id ?? null);
        setPaymentMethods(methods);
        setPaymentMethod(defaultPaymentMethod(methods));
        setShippingMethods(ships);
        setShippingMethod(defaultShippingMethod(ships));
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
  }, [id]);

  useEffect(() => {
    if (status === 'login') {
      router.replace(`/login?next=/rfq/${id}`);
    }
  }, [status, id, router]);

  async function handleAccept(): Promise<void> {
    if (accepting || addressId === null || paymentMethod === null || shippingMethod === null) {
      return;
    }
    setAccepting(true);
    setAcceptError(null);
    try {
      const result = await acceptRfq(id, { addressId, paymentMethod, shippingMethod });
      router.push(`/orders/${result.orderId}`);
    } catch (acceptFailure) {
      if (acceptFailure instanceof ApiError && acceptFailure.status === 401) {
        router.push('/login');
        return;
      }
      // A lapsed quote 410s: refresh the row so the EXPIRED state renders.
      if (acceptFailure instanceof ApiError && acceptFailure.status === 410) {
        try {
          setRfq(await fetchRfqDetail(id));
        } catch {
          // Fall through to the inline message below.
        }
      }
      setAcceptError(
        acceptFailure instanceof ApiError
          ? (acceptFailure.payload?.message ?? ACCEPT_FAILED)
          : ACCEPT_FAILED,
      );
    } finally {
      setAccepting(false);
    }
  }

  if (status === 'checking' || status === 'loading' || status === 'login') {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری استعلام">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 'error' || rfq === null) {
    return (
      <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
        {error ?? LOAD_FAILED}
      </p>
    );
  }

  const quoted = rfq.quotedUnitPrice !== null && rfq.quotedLineTotal !== null;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-bold text-fg">{rfq.productName}</p>
            <p className="mt-1 text-xs text-fg-muted">
              {formatFaNumber(rfq.quantity)} عدد — کد {rfq.variantSku}
            </p>
          </div>
          <Badge variant={rfq.status === 'ACCEPTED' ? 'success' : 'neutral'}>
            {rfqStatusLabel(rfq.status)}
          </Badge>
        </div>
        {quoted ? (
          <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-secondary">قیمت توافقی هر عدد</dt>
              <dd className="font-bold text-accent-hover">
                {formatToman(rialToTomanString(rfq.quotedUnitPrice ?? '0'))}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-secondary">جمع توافق‌شده</dt>
              <dd className="font-bold text-accent-hover">
                {formatToman(rialToTomanString(rfq.quotedLineTotal ?? '0'))}
              </dd>
            </div>
            {rfq.status === 'QUOTED' ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-fg-secondary">مهلت پذیرش</dt>
                <dd>
                  <CountdownTimer endsAt={rfq.expiresAt} size="sm" />
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Card>

      {rfq.status === 'PENDING' ? (
        <Card className="p-5 text-sm leading-6 text-fg-secondary">
          استعلام شما ثبت شد و در انتظار اعلام قیمت از سوی فروشگاه است. پس
          از قیمت‌گذاری، همین‌جا می‌توانید آن را بپذیرید و سفارش ثبت کنید.
        </Card>
      ) : null}

      {rfq.status === 'QUOTED' ? (
        <section aria-labelledby="rfq-accept">
          <SectionHeader
            id="rfq-accept"
            title="پذیرش و ثبت سفارش"
            subtitle="قیمت توافق‌شده در سفارش ثبت می‌شود"
          />
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-fg">نشانی تحویل</h3>
              <div className="mt-2">
                <AddressPicker
                  addresses={addresses}
                  selectedId={addressId}
                  onSelect={setAddressId}
                  onCreated={(row) => {
                    setAddresses((rows) => [...rows, row]);
                    setAddressId(row.id);
                  }}
                />
              </div>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-fg">شیوه ارسال</legend>
              <div className="mt-2 space-y-2">
                {shippingMethods.map((method) => (
                  <label
                    key={method.code}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="rfq-shipping"
                      value={method.code}
                      checked={shippingMethod === method.code}
                      disabled={!isShippingEnabled(method)}
                      onChange={() => setShippingMethod(method.code)}
                      className="size-4 accent-accent"
                    />
                    <span className="font-medium text-fg">{method.titleFa}</span>
                    <span className="text-xs text-fg-muted">
                      {isShippingEnabled(method)
                        ? `هزینه ارسال: ${formatToman(method.fee)}`
                        : 'غیرفعال'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold text-fg">شیوه پرداخت</legend>
              <div className="mt-2 space-y-2">
                {paymentMethods.map((method) => (
                  <label
                    key={method.code}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="rfq-payment"
                      value={method.code}
                      checked={paymentMethod === method.code}
                      disabled={!method.enabled}
                      onChange={() => setPaymentMethod(method.code)}
                      className="size-4 accent-accent"
                    />
                    <span className="font-medium text-fg">{method.titleFa}</span>
                    <span className="text-xs text-fg-muted">{method.descFa}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={accepting || addressId === null || paymentMethod === null || shippingMethod === null}
              onClick={() => void handleAccept()}
            >
              {accepting ? 'در حال ثبت سفارش…' : 'پذیرش و ثبت سفارش'}
            </Button>
            {acceptError ? (
              <p role="alert" className="text-sm leading-6 text-danger">
                {acceptError}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {rfq.status === 'ACCEPTED' && rfq.orderId !== null ? (
        <Card className="p-5 text-sm">
          <p className="leading-6 text-fg-secondary">
            این استعلام پذیرفته شد و سفارش آن ثبت است.
          </p>
          <Link
            href={`/orders/${rfq.orderId}`}
            className={buttonVariants({ variant: 'primary' }) + ' mt-4'}
          >
            مشاهده سفارش
          </Link>
        </Card>
      ) : null}

      {rfq.status === 'REJECTED' ? (
        <Card className="p-5 text-sm leading-6 text-fg-secondary">
          این استعلام از سوی فروشگاه رد شد. برای هماهنگی با پشتیبانی در تماس
          باشید.
        </Card>
      ) : null}

      {rfq.status === 'EXPIRED' ? (
        <Card className="p-5 text-sm leading-6 text-fg-secondary">
          مهلت پذیرش این استعلام به پایان رسید. در صورت نیاز، استعلام تازه‌ای
          ثبت کنید.
        </Card>
      ) : null}
    </div>
  );
}
