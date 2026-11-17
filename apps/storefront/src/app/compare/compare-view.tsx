'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CatalogProductDetailDto } from '@sabz/types';
import { CompareTable } from '@/components/ecommerce/compare/compare-table';
import { useCompare } from '@/components/ecommerce/compare/compare-provider';
import { buttonVariants } from '@/components/ecommerce/ui/button';
import { buildCompareHref, compareSlugs, type CompareEntry } from '@/lib/compare';

interface CompareViewProps {
  urlSlugs: string[];
  urlEntries: CompareEntry[];
  products: CatalogProductDetailDto[];
}

/**
 * Compare view (SS-237, client): owns the storage↔URL sync, then renders the
 * server-fetched table or the Persian empty state.
 *
 * - Shared link (`?products=` non-empty): adopts the URL entries into the
 *   local list so the header badge matches the table. Dead slugs are left
 *   alone — the list is never wiped over an unpublished product.
 * - Bare `/compare` with a stored list: replaces the URL so the server
 *   renders the table (shareable) without any client-side catalog fetching.
 */
export function CompareView({ urlSlugs, urlEntries, products }: CompareViewProps) {
  const router = useRouter();
  const { ready, entries, replace, clear } = useCompare();
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!ready || synced) {
      return;
    }
    if (urlSlugs.length > 0) {
      if (urlEntries.length > 0) {
        replace(urlEntries);
      }
      // The provider sync above is the external-system sync; the flag below
      // only records that it ran once. Intentional, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSynced(true);
      return;
    }
    if (entries.length > 0) {
      // Navigation remounts with the stored slugs; stay on the skeleton
      // meanwhile so the empty state never flashes.
      router.replace(buildCompareHref(compareSlugs(entries)));
      return;
    }
    setSynced(true);
  }, [ready, synced, urlSlugs, urlEntries, entries, replace, router]);

  if (!ready || !synced) {
    return (
      <div
        className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
        aria-busy="true"
        aria-label="در حال بارگذاری مقایسه"
      >
        <div className="h-8 w-48 rounded-control bg-surface-2" aria-hidden="true" />
        <div className="mt-6 h-64 rounded-card bg-surface-2" aria-hidden="true" />
      </div>
    );
  }

  if (products.length === 0) {
    const staleLink = urlSlugs.length > 0;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-balance text-2xl font-extrabold text-fg">
          مقایسه محصولات
        </h1>
        <div className="mt-8 rounded-panel border border-border bg-surface">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-pill bg-accent-soft text-accent">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-7">
                <path
                  d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 className="mt-5 text-lg font-semibold text-fg">
              {staleLink
                ? 'محصولات انتخاب‌شده یافت نشدند'
                : 'هنوز محصولی برای مقایسه انتخاب نکرده‌اید'}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-fg-secondary">
              {staleLink
                ? 'این پیوند مقایسه به محصولاتی اشاره می‌کند که دیگر منتشر نیستند. فهرست را پاک کنید و دوباره انتخاب کنید.'
                : 'تا چهار محصول را با دکمه مقایسه روی کارت یا صفحه محصول انتخاب کنید تا اینجا کنار هم ببینید.'}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {staleLink ? (
                <button
                  type="button"
                  onClick={() => {
                    clear();
                    router.replace('/compare');
                  }}
                  className={buttonVariants({ variant: 'primary' })}
                >
                  پاک کردن فهرست مقایسه
                </button>
              ) : null}
              <Link href="/products" className={buttonVariants({ variant: staleLink ? 'outline' : 'primary' })}>
                رفتن به فروشگاه
                <span aria-hidden="true" className="ms-2">
                  ←
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-balance text-2xl font-extrabold text-fg">
        مقایسه محصولات
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        {products.length.toLocaleString('fa-IR')} محصول
      </p>
      <div className="mt-6">
        <CompareTable products={products} />
      </div>
    </div>
  );
}
