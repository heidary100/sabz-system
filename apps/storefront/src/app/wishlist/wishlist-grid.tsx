'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { WishlistItemDto } from '@sabz/types';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { ProductCardSkeleton } from '@/components/ecommerce/skeleton/product-card-skeleton';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { WishlistHeart } from '@/components/ecommerce/wishlist/wishlist-heart';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import { fetchWishlist } from '@/lib/wishlist';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'error';

const LOAD_FAILED = 'دریافت علاقه‌مندی‌ها ناموفق بود؛ لطفاً دوباره تلاش کنید.';

/**
 * Customer wishlist grid (SS-231): login gate, skeleton loading, Persian
 * empty state, and the saved cards with remove-on-untoggle. Rows reuse the
 * listing `ProductCard` verbatim — no second price conversion, no fake data.
 */
export function WishlistGrid() {
  const [status, setStatus] = useState<Status>('checking');
  const [items, setItems] = useState<WishlistItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    fetchWishlist()
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setItems(rows);
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
  }, []);

  useEffect(() => {
    // Session lives in localStorage (client only): the gate below must run
    // post-hydration. Intentional external sync, not derived state.
    if (!hasSession()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('login');
      return;
    }
    return load();
  }, [load]);

  if (status === 'checking' || status === 'loading') {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-busy="true" aria-label="در حال بارگذاری علاقه‌مندی‌ها">
        <div className="h-8 w-48 rounded-md bg-sand-100" aria-hidden="true" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-balance text-2xl font-extrabold text-ink-900">علاقه‌مندی‌ها</h1>
        <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-sabz-50 text-sabz-600">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-7">
                <path
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 className="mt-5 text-lg font-semibold text-ink-900">برای مشاهده علاقه‌مندی‌ها وارد شوید</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">
              علاقه‌مندی‌ها به حساب کاربری شما متصل است. وارد شوید تا محصولاتی
              که ذخیره کرده‌اید را ببینید.
            </p>
            <Link href="/login" className={`${buttonVariants({ variant: 'primary' })} mt-8`}>
              ورود / ثبت‌نام
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-balance text-2xl font-extrabold text-ink-900">علاقه‌مندی‌ها</h1>
        <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-ink-900">خطا در بارگذاری علاقه‌مندی‌ها</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">{error ?? LOAD_FAILED}</p>
            <Button variant="primary" className="mt-8" onClick={load}>
              تلاش مجدد
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-balance text-2xl font-extrabold text-ink-900">علاقه‌مندی‌ها</h1>
        <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-sabz-50 text-sabz-600">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-7">
                <path
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 className="mt-5 text-lg font-semibold text-ink-900">هنوز محصولی به علاقه‌مندی‌ها اضافه نکرده‌اید</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">
              محصولات موردعلاقه‌تان را با زدن قلب روی کارت محصول ذخیره کنید تا
              اینجا ببینید.
            </p>
            <Link href="/products" className={`${buttonVariants({ variant: 'primary' })} mt-8`}>
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-balance text-2xl font-extrabold text-ink-900">علاقه‌مندی‌ها</h1>
      <p className="mt-1 text-sm text-gray-500">
        {items.length.toLocaleString('fa-IR')} محصول
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {items.map((product) => (
          <div key={product.id} className="relative">
            <ProductCard product={product} />
            <div className="absolute end-2 top-2">
              <WishlistHeart
                productId={product.id}
                initialActive
                onToggle={(active) => {
                  if (!active) {
                    setItems((current) =>
                      current.filter((row) => row.id !== product.id),
                    );
                  }
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
