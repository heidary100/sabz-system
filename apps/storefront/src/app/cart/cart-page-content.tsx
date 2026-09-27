'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import type { CartItemDto } from '@sabz/types';
import { useCart, type CartActionResult } from '@/components/ecommerce/cart/cart-provider';
import { CartQtyStepper } from '@/components/ecommerce/cart/cart-qty-stepper';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { mediaImageUrl } from '@/lib/catalog';
import { CART_MAX_QUANTITY } from '@/lib/cart';
import { formatFaNumber, formatToman } from '@/lib/format';

/**
 * Cart page island (SS-232): per-user, never cached. Guests see an honest
 * guest view (count + login CTA — product rows need server data, which the
 * no-client-catalog-fetch rule forbids reconstructing); members get
 * steppers, removal, a live summary, and price/stock truth per line.
 */
export function CartPageContent() {
  const {
    ready,
    authed,
    items,
    totalQuantity,
    subtotal,
    guestLines,
    count,
    lastMerge,
    clearMerge,
    refresh,
    setQuantity,
    removeLine,
    clear,
  } = useCart();
  const [clearing, setClearing] = useState(false);

  if (!ready) {
    return (
      <div
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
        aria-busy="true"
        aria-label="در حال بارگذاری سبد خرید"
      >
        <div className="h-8 w-48 rounded-md bg-sand-100" aria-hidden="true" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-24 rounded-xl bg-sand-100" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (!authed && guestLines.length === 0) {
    return <CartEmptyState />;
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">سبد خرید</h1>
        <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-sabz-50 text-sabz-600">
              <CartIcon />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-ink-900">
              {formatFaNumber(count)} قلم در سبد مهمان شماست
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">
              برای مشاهده جزئیات، قیمت و ادامه خرید وارد شوید؛ سبد مهمان پس
              از ورود به حساب شما منتقل می‌شود.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className={buttonVariants({ variant: 'primary' })}>
                ورود / ثبت‌نام
              </Link>
              <Button
                variant="outline"
                disabled={clearing}
                onClick={() => {
                  setClearing(true);
                  void clear().finally(() => setClearing(false));
                }}
              >
                پاک کردن سبد مهمان
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return <CartEmptyState />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">سبد خرید</h1>
      <p className="mt-1 text-sm text-gray-500">
        {formatFaNumber(totalQuantity)} قلم
      </p>

      {lastMerge && (lastMerge.merged > 0 || lastMerge.failed.length > 0) ? (
        <div className="mt-4 rounded-xl border border-sabz-200 bg-sabz-50 p-4 text-sm leading-6 text-sabz-800">
          <div className="flex items-start justify-between gap-2">
            <p>
              {lastMerge.merged > 0 ? (
                <>{formatFaNumber(lastMerge.merged)} قلم از سبد مهمان ادغام شد. </>
              ) : null}
              {lastMerge.failed.length > 0 ? (
                <>{formatFaNumber(lastMerge.failed.length)} قلم به‌دلیل موجودی یا قیمت ادغام نشد.</>
              ) : null}
            </p>
            <button
              type="button"
              onClick={clearMerge}
              aria-label="بستن پیام ادغام"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full hover:bg-white"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ul role="list" className="divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white px-4 sm:px-6">
          {items.map((item) => (
            <CartLineRow
              key={item.variantId}
              item={item}
              onSetQuantity={(quantity) => setQuantity(item.variantId, quantity)}
              onRemove={() => removeLine(item.variantId)}
            />
          ))}
        </ul>

        <aside aria-label="خلاصه سبد خرید" className="h-fit rounded-2xl border border-sand-200 bg-white p-5 lg:sticky lg:top-24">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-600">تعداد اقلام</dt>
              <dd className="font-semibold text-ink-900">{formatFaNumber(totalQuantity)} قلم</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-sand-200 pt-3">
              <dt className="font-semibold text-ink-900">جمع سبد</dt>
              <dd aria-live="polite" className="text-lg font-bold text-sabz-800">
                {formatToman(subtotal)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            قیمت‌ها به تومان و بر اساس آخرین قیمت فروشگاه محاسبه شده است.
          </p>
          <Link href="/checkout" className={`${buttonVariants({ variant: 'primary', size: 'lg' })} mt-4 w-full`}>
            ادامه و تسویه حساب
          </Link>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Link
              href="/products"
              className={`${buttonVariants({ variant: 'ghost' })} px-2`}
            >
              ادامه خرید
            </Link>
            <Button
              variant="ghost"
              className="px-2 text-red-700 hover:bg-red-50 hover:text-red-700"
              disabled={clearing}
              onClick={() => {
                setClearing(true);
                void clear()
                  .catch(() => void refresh())
                  .finally(() => setClearing(false));
              }}
            >
              پاک کردن سبد
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CartLineRow({
  item,
  onSetQuantity,
  onRemove,
}: {
  item: CartItemDto;
  onSetQuantity: (quantity: number) => Promise<CartActionResult>;
  onRemove: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const image = mediaImageUrl(item.primaryImageUrl);

  async function handleQuantity(quantity: number): Promise<CartActionResult> {
    const result = await onSetQuantity(quantity);
    setError(result.ok ? null : result.error.message);
    return result;
  }

  return (
    <li className="flex gap-4 py-5">
      <Link
        href={`/products/${item.productSlug}`}
        aria-label={item.productName}
        className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-sand-100 sm:size-24"
      >
        {image ? (
          <Image src={image} alt="" fill sizes="96px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sabz-300">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-8">
              <path
                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0 0 21.75 19.5V4.5A1.5 1.5 0 0 0 20.25 3H3.75A1.5 1.5 0 0 0 2.25 4.5v15A1.5 1.5 0 0 0 3.75 21Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/products/${item.productSlug}`}
          className="line-clamp-2 font-semibold leading-6 text-ink-900 hover:text-sabz-700"
        >
          {item.productName}
        </Link>
        <p className="mt-1 text-xs text-gray-500">
          {item.variantName ?? item.variantSku}
          {item.variantName ? <span className="ms-2" dir="ltr">{item.variantSku}</span> : null}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          قیمت واحد: {formatToman(item.unitPrice)}
        </p>
        {item.priceChanged ? (
          <p className="mt-1 text-xs font-medium text-amber-700">
            قیمت این کالا نسبت به زمان افزودن تغییر کرده است (افزودن: {formatToman(item.unitPriceAtAdd)}).
          </p>
        ) : null}
        {!item.inStock ? (
          <p className="mt-1 text-xs font-medium text-red-700">
            این کالا فعلاً ناموجود است و در تسویه لحاظ نمی‌شود.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <CartQtyStepper
            quantity={item.quantity}
            max={Math.max(1, Math.min(item.available, CART_MAX_QUANTITY))}
            itemLabel={item.productName}
            onChange={handleQuantity}
          />
          <p aria-live="polite" className="text-base font-bold text-sabz-800">
            {formatToman(item.lineTotal)}
          </p>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-xs leading-5 text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-1">
          <button
            type="button"
            disabled={removing}
            onClick={() => {
              setRemoving(true);
              void onRemove().finally(() => setRemoving(false));
            }}
            aria-label={`حذف ${item.productName} از سبد خرید`}
            className="flex min-h-11 items-center rounded-md px-2 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            حذف از سبد
          </button>
        </div>
      </div>
    </li>
  );
}

function CartEmptyState() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">سبد خرید</h1>

      <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-sabz-50 text-sabz-600">
            <CartIcon />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-ink-900">سبد خرید شما خالی است</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">
            هنوز محصولی به سبد خرید اضافه نکرده‌اید. از میان دسته‌بندی‌های فروشگاه
            دیدن کنید تا محصول مورد نظرتان را پیدا کنید.
          </p>
          <Link
            href="/products"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-sabz-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sabz-800"
          >
            رفتن به فروشگاه
            <span aria-hidden="true" className="ms-2">
              ←
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-7">
      <path
        d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
