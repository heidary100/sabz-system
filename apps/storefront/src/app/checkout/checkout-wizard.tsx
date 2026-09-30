'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AddressDto,
  CheckoutSummaryDto,
  PaymentMethod,
  PaymentMethodDto,
  ShippingMethodCode,
  ShippingMethodDto,
} from '@sabz/types';
import { useCart } from '@/components/ecommerce/cart/cart-provider';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { Card } from '@/components/ecommerce/ui/card';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { defaultAddress, fetchAddresses } from '@/lib/addresses';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import {
  defaultPaymentMethod,
  fetchPaymentMethods,
  fetchShippingMethods,
  isPaymentEnabled,
  parseCheckoutStep,
  placeOrder,
  validateCheckout,
  type CheckoutStep,
} from '@/lib/checkout';
import { formatToman } from '@/lib/format';
import { AddressPicker } from '@/components/ecommerce/checkout/address-picker';
import { CheckoutSteps } from '@/components/ecommerce/checkout/checkout-steps';
import { MethodRadio } from '@/components/ecommerce/checkout/method-radio';
import { OrderSummary } from '@/components/ecommerce/checkout/order-summary';

const LOAD_FAILED = 'دریافت اطلاعات تسویه ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const PLACE_FAILED = 'ثبت سفارش ناموفق بود؛ لطفاً دوباره تلاش کنید.';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'error';

/**
 * Checkout wizard (SS-233): cart → address → shipping → payment → review.
 * Steps live in `?step=` (unknown values fall back to `cart`). Guests are
 * sent to `/login?next=/checkout`. Totals render only from the read-only
 * `POST /checkout/validate` preview — never computed client-side.
 */
export function CheckoutWizard({ stepParam }: { stepParam: unknown }) {
  const router = useRouter();
  const { ready: cartReady, authed, items, refresh } = useCart();
  const step = parseCheckoutStep(stepParam);

  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [shipping, setShipping] = useState<ShippingMethodDto[]>([]);
  const [payments, setPayments] = useState<PaymentMethodDto[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [shippingCode, setShippingCode] = useState<ShippingMethodCode | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);

  const [summary, setSummary] = useState<CheckoutSummaryDto | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  useEffect(() => {
    if (!cartReady) {
      return;
    }
    if (!hasSession() || !authed) {
      // Session lives in localStorage (client only): the gate below must
      // run post-hydration. Intentional external sync, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('login');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    Promise.all([fetchAddresses(), fetchShippingMethods(), fetchPaymentMethods()])
      .then(([book, ships, pays]) => {
        if (cancelled) {
          return;
        }
        setAddresses(book);
        setShipping(ships);
        setPayments(pays);
        setSelectedAddressId((current) => current ?? defaultAddress(book)?.id ?? null);
        setShippingCode((current) => current ?? ships[0]?.code ?? null);
        // SS-234 COD-only: prefer COD, fall back to the first enabled
        // method (never an ONLINE stub the server rejects with 422).
        setPayment((current) => current ?? defaultPaymentMethod(pays));
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
  }, [cartReady, authed]);

  // Review preview: re-validated whenever the step or address changes.
  useEffect(() => {
    if (status !== 'ready' || step !== 'review') {
      return;
    }
    let cancelled = false;
    // Reset the preview before re-validating: the fetch below owns the
    // next render. Intentional fetch-state reset, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSummary(null);
    setSummaryError(null);
    validateCheckout(selectedAddressId ?? undefined)
      .then((preview) => {
        if (!cancelled) {
          setSummary(preview);
        }
      })
      .catch((previewError: unknown) => {
        if (cancelled) {
          return;
        }
        if (previewError instanceof ApiError && previewError.status === 401) {
          setStatus('login');
          return;
        }
        setSummaryError(
          previewError instanceof ApiError
            ? (previewError.payload?.message ?? LOAD_FAILED)
            : LOAD_FAILED,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [status, step, selectedAddressId]);

  if (status === 'checking' || (status === 'ready' && !cartReady)) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6" aria-busy="true" aria-label="در حال بارگذاری تسویه حساب">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-balance text-2xl font-extrabold text-ink-900">تسویه حساب</h1>
        <Card className="mt-8 p-6 text-center">
          <p className="text-sm leading-6 text-gray-600">
            برای ادامه تسویه وارد شوید؛ سبد مهمان پس از ورود به حساب شما منتقل می‌شود.
          </p>
          <Link href="/login?next=/checkout" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
            ورود / ثبت‌نام
          </Link>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-balance text-2xl font-extrabold text-ink-900">تسویه حساب</h1>
        <p role="alert" className="mt-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error ?? LOAD_FAILED}
        </p>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6" aria-busy="true" aria-label="در حال بارگذاری تسویه حساب">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-balance text-2xl font-extrabold text-ink-900">تسویه حساب</h1>
        <Card className="mt-8 p-6 text-center">
          <p className="text-sm leading-6 text-gray-600">
            سبد خرید شما خالی است؛ ابتدا محصولات را به سبد اضافه کنید.
          </p>
          <Link href="/cart" className={buttonVariants({ variant: 'primary' }) + ' mt-6'}>
            بازگشت به سبد خرید
          </Link>
        </Card>
      </div>
    );
  }

  const reachable: CheckoutStep = !cartReady || items.length === 0
    ? 'cart'
    : selectedAddressId === null
      ? 'address'
      : shippingCode === null
        ? 'shipping'
        : payment === null
          ? 'payment'
          : 'review';
  const order = ['cart', 'address', 'shipping', 'payment', 'review'] as const;
  const visibleStep = order.indexOf(step) <= order.indexOf(reachable) ? step : reachable;

  async function handlePlace(): Promise<void> {
    if (selectedAddressId === null || payment === null) {
      return;
    }
    setPlacing(true);
    setPlaceError(null);
    try {
      const result = await placeOrder(selectedAddressId, payment);
      await refresh();
      router.push(`/orders/${result.orderId}`);
    } catch (placeFailure) {
      if (placeFailure instanceof ApiError && placeFailure.status === 401) {
        setStatus('login');
        return;
      }
      setPlaceError(
        placeFailure instanceof ApiError
          ? (placeFailure.payload?.message ?? PLACE_FAILED)
          : PLACE_FAILED,
      );
      setPlacing(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-balance text-2xl font-extrabold text-ink-900">تسویه حساب</h1>
      <div className="mt-4">
        <CheckoutSteps current={visibleStep} reachable={reachable} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Step transitions (SS-246): the step column keys on the visible
            step, so each stage enters with the shared fade-up entrance;
            reduced-motion collapses it to instant. */}
        <div key={visibleStep} className="animate-fade-up">
          {visibleStep === 'cart' ? (
            <Card className="p-6">
              <SectionHeader id="checkout-cart" title="بررسی سبد" subtitle={`${items.length} قلم در سبد شماست`} />
              <ul role="list" className="mt-4 space-y-3 text-sm">
                {items.map((item) => (
                  <li key={item.variantId} className="flex items-start justify-between gap-3 border-b border-sand-100 pb-3 last:border-0">
                    <span className="leading-6 text-gray-600">
                      {item.productName} × {item.quantity}
                      {item.priceChanged ? (
                        <span className="block text-xs text-amber-700">
                          قیمت نسبت به زمان افزودن تغییر کرده است.
                        </span>
                      ) : null}
                      {!item.inStock ? (
                        <span className="block text-xs text-red-700">
                          این قلم ناموجود است و در تسویه لحاظ نمی‌شود.
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-semibold text-ink-900">
                      {formatToman(item.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/checkout?step=address" className={buttonVariants({ variant: 'primary' })}>
                  ادامه به نشانی
                </Link>
                <Link href="/cart" className={buttonVariants({ variant: 'ghost' })}>
                  ویرایش سبد
                </Link>
              </div>
            </Card>
          ) : null}

          {visibleStep === 'address' ? (
          /* Step transitions (SS-246): each step remounts with the shared
             fade-up entrance; reduced-motion collapses it to instant. */
            <Card className="p-6">
              <SectionHeader id="checkout-address" title="نشانی تحویل" subtitle="نشانی انتخابی در سفارش ثبت می‌شود" />
              <div className="mt-4">
                <AddressPicker
                  addresses={addresses}
                  selectedId={selectedAddressId}
                  onSelect={setSelectedAddressId}
                  onCreated={(row) => {
                    setAddresses((current) => [...current, row]);
                    setSelectedAddressId(row.id);
                  }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/checkout?step=shipping"
                  aria-disabled={selectedAddressId === null}
                  className={
                    buttonVariants({ variant: 'primary' }) +
                    (selectedAddressId === null ? ' pointer-events-none opacity-50' : '')
                  }
                >
                  ادامه به شیوه ارسال
                </Link>
                <Link href="/checkout?step=cart" className={buttonVariants({ variant: 'ghost' })}>
                  بازگشت
                </Link>
              </div>
            </Card>
          ) : null}

          {visibleStep === 'shipping' ? (
            <Card className="p-6">
              <SectionHeader id="checkout-shipping" title="شیوه ارسال" subtitle="هزینه ارسال در این نسخه صفر است" />
              <div className="mt-4">
                <MethodRadio
                  name="شیوه ارسال"
                  options={shipping.map((method) => ({
                    code: method.code,
                    title: `${method.titleFa} — ${method.etaFa}`,
                    desc: method.fee === '0' ? 'هزینه ارسال: رایگان (نسخه آزمایشی)' : '',
                  }))}
                  selected={shippingCode}
                  onSelect={setShippingCode}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/checkout?step=payment"
                  aria-disabled={shippingCode === null}
                  className={
                    buttonVariants({ variant: 'primary' }) +
                    (shippingCode === null ? ' pointer-events-none opacity-50' : '')
                  }
                >
                  ادامه به شیوه پرداخت
                </Link>
                <Link href="/checkout?step=address" className={buttonVariants({ variant: 'ghost' })}>
                  بازگشت
                </Link>
              </div>
            </Card>
          ) : null}

          {visibleStep === 'payment' ? (
            <Card className="p-6">
              <SectionHeader id="checkout-payment" title="شیوه پرداخت" subtitle="پرداخت در محل فعال است؛ پرداخت آنلاین به‌زودی" />
              <div className="mt-4">
                <MethodRadio
                  name="شیوه پرداخت"
                  options={payments.map((method) => ({
                    code: method.code,
                    title: method.titleFa,
                    desc: method.descFa,
                    disabled: !isPaymentEnabled(method),
                  }))}
                  selected={payment}
                  onSelect={setPayment}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/checkout?step=review"
                  aria-disabled={payment === null}
                  className={
                    buttonVariants({ variant: 'primary' }) +
                    (payment === null ? ' pointer-events-none opacity-50' : '')
                  }
                >
                  بازبینی سفارش
                </Link>
                <Link href="/checkout?step=shipping" className={buttonVariants({ variant: 'ghost' })}>
                  بازگشت
                </Link>
              </div>
            </Card>
          ) : null}

          {visibleStep === 'review' ? (
            <Card className="p-6">
              <SectionHeader id="checkout-review" title="بازبینی و ثبت" subtitle="موجودی و قیمت لحظه ثبت دوباره بررسی می‌شود" />
              <div className="mt-4">
                {summaryError !== null ? (
                  <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {summaryError}
                  </p>
                ) : null}
                {summary !== null && summary.problems.length > 0 ? (
                  <div role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
                    <ul role="list" className="space-y-1">
                      {summary.problems.map((problem) => (
                        <li key={`${problem.code}-${problem.variantId}`}>{problem.message}</li>
                      ))}
                    </ul>
                    <Link href="/cart" className="mt-2 inline-block font-semibold underline underline-offset-4">
                      بازگشت به سبد خرید
                    </Link>
                  </div>
                ) : null}
                {placeError !== null ? (
                  <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {placeError}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={placing || summary === null || !summary.valid}
                    onClick={() => void handlePlace()}
                  >
                    {placing ? 'در حال ثبت سفارش…' : 'ثبت سفارش'}
                  </Button>
                  <Link href="/checkout?step=payment" className={buttonVariants({ variant: 'ghost' })}>
                    بازگشت
                  </Link>
                </div>
                {summary !== null && !summary.valid && summary.problems.length === 0 ? (
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    سبد خرید هیچ قلم قابل تسویه‌ای ندارد.
                  </p>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>

        <div>
          {summary !== null && visibleStep === 'review' ? (
            <OrderSummary summary={summary} />
          ) : (
            <aside aria-label="راهنمای تسویه" className="h-fit rounded-2xl border border-sand-200 bg-white p-5 text-sm leading-6 text-gray-600">
              <p>
                در مرحله بازبینی، موجودی و قیمت نهایی از فروشگاه خوانده و
                خلاصه سفارش نمایش داده می‌شود.
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
