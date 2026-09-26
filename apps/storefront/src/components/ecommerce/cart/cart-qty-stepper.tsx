'use client';

import { useState } from 'react';
import type { CartActionResult } from '@/components/ecommerce/cart/cart-provider';
import { formatFaNumber } from '@/lib/format';

/**
 * Quantity stepper (SS-232): shared by the mini-cart and the /cart page.
 * Controlled (the value always comes from the cart store); the parent owns
 * error display. Minus never goes below 1 (removal has its own explicit
 * button); plus caps at `max` (server stock or the 99 line bound).
 */
export function CartQtyStepper({
  quantity,
  max,
  itemLabel,
  onChange,
}: {
  quantity: number;
  max: number;
  /** Product name for Persian accessible labels. */
  itemLabel: string;
  onChange: (quantity: number) => Promise<CartActionResult>;
}) {
  const [pending, setPending] = useState(false);

  async function change(next: number): Promise<void> {
    if (pending || next === quantity || next < 1 || next > max) {
      return;
    }
    setPending(true);
    try {
      await onChange(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="group"
      aria-label={`تعداد ${itemLabel}`}
      className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-white"
    >
      <button
        type="button"
        onClick={() => void change(quantity + 1)}
        disabled={pending || quantity >= max}
        aria-label={`افزایش تعداد ${itemLabel}`}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-lg font-bold text-sabz-700 transition-colors hover:bg-sabz-50 disabled:opacity-40"
      >
        <span aria-hidden="true">+</span>
      </button>
      <span
        aria-live="polite"
        aria-label={`${formatFaNumber(quantity)} عدد`}
        className="min-w-8 text-center text-sm font-bold text-ink-900"
      >
        {formatFaNumber(quantity)}
      </span>
      <button
        type="button"
        onClick={() => void change(quantity - 1)}
        disabled={pending || quantity <= 1}
        aria-label={`کاهش تعداد ${itemLabel}`}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-lg font-bold text-sabz-700 transition-colors hover:bg-sabz-50 disabled:opacity-40"
      >
        <span aria-hidden="true">−</span>
      </button>
    </div>
  );
}
