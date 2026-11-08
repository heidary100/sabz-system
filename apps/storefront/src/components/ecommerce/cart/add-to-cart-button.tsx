'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart, type CartActionResult } from '@/components/ecommerce/cart/cart-provider';
import { Button } from '@/components/ecommerce/ui/button';
import { ApiError } from '@/lib/api';
import type { CartAddInput } from '@/lib/cart';

/**
 * Add-to-cart button (SS-232): calls the cart store with a variant identity
 * (detail panel) or a product quick-add identity (card slot). Success opens
 * the mini-cart via the provider; a dead session routes to /login; stock
 * failures render inline in Persian. Render ONLY for purchasable surfaces
 * (in-stock + PRICED) — never for call-for-price or out-of-stock rows.
 */
export function AddToCartButton({
  identity,
  productName,
  size = 'full',
}: {
  identity: CartAddInput;
  productName: string;
  /** `full` for the detail panel, `icon` for overlays, `card` for card footers. */
  size?: 'full' | 'icon' | 'card';
}) {
  const { add } = useCart();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    let result: CartActionResult;
    try {
      result = await add(identity, 1);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        router.push('/login');
        return;
      }
      setError('افزودن به سبد خرید ناموفق بود؛ لطفاً دوباره تلاش کنید.');
      return;
    } finally {
      setPending(false);
    }
    if (!result.ok) {
      setError(result.error.message);
    }
  }

  if (size === 'card') {
    return (
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={pending}
          aria-label={`افزودن ${productName} به سبد خرید`}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control bg-accent px-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:bg-surface-3 disabled:text-fg-muted"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
            className="size-4 shrink-0"
          >
            <path
              d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {pending ? 'افزودن…' : 'افزودن'}
        </button>
        {error ? (
          <span role="alert" className="text-[11px] leading-4 text-danger">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  if (size === 'icon') {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={pending}
          aria-label={`افزودن ${productName} به سبد خرید`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-surface text-fg-muted ring-1 ring-inset ring-border-control transition-colors hover:text-accent disabled:opacity-60"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
            className="size-5"
          >
            <path
              d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {error ? (
          <span role="alert" className="max-w-40 rounded-control bg-surface px-2 py-1 text-[11px] leading-4 text-danger shadow-card">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="block">
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() => void handleAdd()}
      >
        {pending ? 'در حال افزودن…' : 'افزودن به سبد خرید'}
      </Button>
      {error ? (
        <span role="alert" className="mt-2 block text-xs leading-5 text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
