'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCart } from '@/components/ecommerce/cart/cart-provider';
import { CartQtyStepper } from '@/components/ecommerce/cart/cart-qty-stepper';
import { buttonVariants } from '@/components/ecommerce/ui/button';
import { useTransitionMount } from '@/components/ecommerce/ui/use-transition-mount';
import { mediaImageUrl } from '@/lib/catalog';
import { formatFaNumber, formatToman } from '@/lib/format';
import { CART_MAX_QUANTITY } from '@/lib/cart';

/**
 * Off-canvas mini-cart drawer (SS-232, animated SS-246): the same dialog
 * contract as the mobile menu (`role="dialog"` + `aria-modal`, Escape
 * closes, body scroll locks, focus moves in on open and back to the header
 * icon on close, Tab trap) mirrored to the `end` side so it never collides
 * with the nav drawer. Slides in/out via the shared drawer choreography
 * (useTransitionMount keeps it mounted through the exit); the global
 * reduced-motion rule collapses both animations to instant.
 */
export function MiniCart() {
  const {
    ready,
    authed,
    items,
    totalQuantity,
    subtotal,
    guestLines,
    count,
    miniCartOpen,
    setMiniCartOpen,
    lastMerge,
    clearMerge,
    setQuantity,
    removeLine,
  } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [shouldRender, animState] = useTransitionMount(miniCartOpen);

  const close = useCallback(
    (returnFocus = true) => {
      setMiniCartOpen(false);
      if (returnFocus) {
        // Focus returns to the header cart icon on close; the icon is the
        // only stable trigger (add-to-cart buttons unmount on navigation).
        document.getElementById('cart-trigger')?.focus();
      }
    },
    [setMiniCartOpen],
  );

  useEffect(() => {
    if (!miniCartOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [miniCartOpen, close]);

  if (!shouldRender) {
    return null;
  }

  const showLines = ready && authed && items.length > 0;
  const showGuest = ready && !authed && guestLines.length > 0;
  const showEmpty = !ready || (authed && items.length === 0) || (!authed && guestLines.length === 0);

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="سبد خرید" className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={() => close(false)}
        data-state={animState}
        className="drawer-backdrop fixed inset-0 bg-overlay"
      />
      <div
        data-state={animState}
        className="drawer-panel drawer-panel--end fixed inset-y-0 end-0 flex w-[26rem] max-w-[92vw] flex-col overflow-hidden rounded-s-panel bg-surface shadow-overlay"
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
          <h2 className="text-base font-bold text-fg">
            سبد خرید
            {ready && count > 0 ? (
              <span className="ms-2 text-sm font-normal text-fg-muted">
                ({formatFaNumber(count)} قلم)
              </span>
            ) : null}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => close()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-surface p-2 text-fg-muted ring-1 ring-inset ring-border hover:text-fg-secondary"
          >
            <span className="sr-only">بستن سبد خرید</span>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-5">
              <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overscroll-contain overflow-y-auto px-4 py-4">
          {lastMerge && (lastMerge.merged > 0 || lastMerge.failed.length > 0) ? (
            <div className="mb-3 rounded-card border border-accent/30 bg-accent-soft p-3 text-sm leading-6 text-accent-hover">
              <div className="flex items-start justify-between gap-2">
                <p>
                  {lastMerge.merged > 0 ? (
                    <>{formatFaNumber(lastMerge.merged)} قلم از سبد مهمان ادغام شد. </>
                  ) : null}
                  {lastMerge.failed.length > 0 ? (
                    <>{formatFaNumber(lastMerge.failed.length)} قلم به‌دلیل موجودی یا قیمت ادغام نشد و در سبد مهمان ماند.</>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={clearMerge}
                  aria-label="بستن پیام ادغام"
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-pill hover:bg-surface-2"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>
          ) : null}

          {showLines ? (
            <ul role="list" className="divide-y divide-border">
              {items.map((item) => {
                const image = mediaImageUrl(item.primaryImageUrl);
                return (
                  <li key={item.variantId} className="flex gap-3 py-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-control bg-surface-2">
                      {image ? (
                        <Image src={image} alt="" fill sizes="64px" className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-accent">
                          <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
                            <path
                              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0 0 21.75 19.5V4.5A1.5 1.5 0 0 0 20.25 3H3.75A1.5 1.5 0 0 0 2.25 4.5v15A1.5 1.5 0 0 0 3.75 21Z"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${item.productSlug}`}
                        onClick={() => close(false)}
                        className="line-clamp-2 text-sm font-semibold leading-6 text-fg hover:text-accent"
                      >
                        {item.productName}
                      </Link>
                      {item.variantName ? (
                        <p className="mt-0.5 text-xs text-fg-muted">{item.variantName}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <CartQtyStepper
                          quantity={item.quantity}
                          max={Math.min(item.available, CART_MAX_QUANTITY)}
                          itemLabel={item.productName}
                          onChange={(quantity) => setQuantity(item.variantId, quantity)}
                        />
                        <p className="text-sm font-bold text-accent-hover">
                          {formatToman(item.lineTotal)}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        {item.priceChanged ? (
                          <p className="text-xs text-warning">قیمت تغییر کرده است</p>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => void removeLine(item.variantId)}
                          aria-label={`حذف ${item.productName} از سبد خرید`}
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-control p-2 text-xs text-fg-muted hover:bg-danger-soft hover:text-danger"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {showGuest ? (
            <div className="rounded-card border border-border bg-surface-2 p-4 text-sm leading-6 text-fg-secondary">
              <p className="font-semibold text-fg">
                {formatFaNumber(count)} قلم در سبد مهمان شماست
              </p>
              <p className="mt-1">
                برای مشاهده جزئیات، قیمت و تسویه وارد شوید؛ سبد مهمان پس از
                ورود به حساب شما منتقل می‌شود.
              </p>
              <Link
                href="/login"
                onClick={() => close(false)}
                className={`${buttonVariants({ variant: 'primary' })} mt-3 w-full`}
              >
                ورود / ثبت‌نام
              </Link>
            </div>
          ) : null}

          {showEmpty ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-pill bg-accent-soft text-accent">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-7">
                  <path
                    d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="mt-4 text-sm font-semibold text-fg">سبد خرید شما خالی است</p>
              <p className="mt-1 text-sm leading-6 text-fg-secondary">
                هنوز محصولی به سبد خرید اضافه نکرده‌اید.
              </p>
            </div>
          ) : null}
        </div>

        {showLines ? (
          <div className="border-t border-border bg-surface px-4 py-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-fg-secondary">
                جمع سبد ({formatFaNumber(totalQuantity)} قلم)
              </span>
              <span aria-live="polite" className="text-base font-bold text-accent-hover">
                {formatToman(subtotal)}
              </span>
            </div>
            <Link
              href="/cart"
              onClick={() => close(false)}
              className={`${buttonVariants({ variant: 'primary', size: 'lg' })} mt-3 w-full`}
            >
              مشاهده سبد خرید
            </Link>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
