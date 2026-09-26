'use client';

import { useCart } from '@/components/ecommerce/cart/cart-provider';
import { formatFaNumber } from '@/lib/format';

/**
 * Header cart icon (SS-232): always rendered (the cart surface is real for
 * guests and members alike), with an honest count badge — the server total
 * when authed, the guest-cart sum when logged out. The badge renders only
 * when the client store is ready and the count is above zero, so the server
 * paint (no badge) never mismatches hydration. Opens the mini-cart drawer.
 */
export function CartHeaderIcon() {
  const { count, ready, setMiniCartOpen } = useCart();

  return (
    <button
      type="button"
      id="cart-trigger"
      onClick={() => setMiniCartOpen(true)}
      aria-haspopup="dialog"
      aria-label={ready && count > 0 ? `سبد خرید، ${formatFaNumber(count)} قلم` : 'سبد خرید'}
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-600 hover:bg-sabz-50 hover:text-sabz-700"
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
        <path
          d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {ready && count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute end-0 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-sabz-700 px-1 text-[11px] font-bold text-white"
        >
          {formatFaNumber(count)}
        </span>
      ) : null}
    </button>
  );
}
