import Link from 'next/link';
import { Suspense } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';
import { MobileMenu } from './mobile-menu';
import { SearchInput } from './search-input';

/**
 * Storefront shell header (SS-124): logo, desktop category navigation with
 * published-product counts, search, cart (placeholder badge — functionality
 * arrives in a later milestone), and the account placeholder.
 */
export function SiteHeader({ categories }: { categories: CatalogCategoryNode[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-4">
          <MobileMenu categories={categories} />

          <BrandLockup />

          <nav aria-label="ناوبری دسته‌بندی‌ها" className="hidden flex-1 items-center gap-1 lg:flex">
            {categories.slice(0, 7).map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.slug}`}
                className="group flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-sabz-50 hover:text-sabz-800"
              >
                <span>{category.name}</span>
                <span className="rounded-full bg-sabz-50 px-1.5 py-0.5 text-[11px] font-semibold text-sabz-600">
                  {formatFaNumber(category.publishedProductCount)}
                </span>
              </Link>
            ))}
          </nav>

          <div className="hidden max-w-md flex-1 lg:flex">
            <Suspense fallback={<div className="h-9 flex-1 rounded-md bg-sand-100" />}>
              <SearchInput compact />
            </Suspense>
          </div>

          <div className="flex flex-1 items-center justify-end gap-1 lg:flex-none">
            <Link
              href="/account"
              className="rounded-md p-2 text-gray-600 hover:bg-sabz-50 hover:text-sabz-700"
            >
              <span className="sr-only">حساب کاربری</span>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
                <path
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              href="/cart"
              className="group relative rounded-md p-2 text-gray-600 hover:bg-sabz-50 hover:text-sabz-700"
            >
              <span className="sr-only">سبد خرید</span>
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
                <path
                  d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {/* Placeholder badge: the cart is populated in a later milestone. */}
              <span className="absolute -top-0.5 -end-0.5 flex size-4 items-center justify-center rounded-full bg-sabz-600 text-[10px] font-semibold text-white">
                ۰
              </span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
