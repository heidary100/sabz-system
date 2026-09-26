import Link from 'next/link';
import { Suspense } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';
import { CartHeaderIcon } from '@/components/ecommerce/cart/cart-header-icon';
import { MiniCart } from '@/components/ecommerce/cart/mini-cart';
import { DesktopNav } from './desktop-nav';
import { MobileMenu } from './mobile-menu';
import { SearchInput } from './search-input';
import { SearchOverlay } from './search-overlay';
import { WishlistHeaderIcon } from './wishlist-header-icon';

/**
 * Storefront shell header (SS-124, SS-211, SS-223, SS-232): two-row layout —
 * row 1 holds the drawer toggle, brand lockup, the desktop search trigger
 * (opens the full-screen overlay) and account/wishlist/cart icons; row 2 is
 * the desktop category nav over the unwrapped effective roots. The cart icon
 * carries an honest count badge (server total or guest sum) and opens the
 * mini-cart drawer; search is visible on mobile as its own header row
 * instead of being drawer-buried.
 */
export function SiteHeader({ categories }: { categories: CatalogCategoryNode[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-2 sm:gap-4">
          <MobileMenu categories={categories} />

          <BrandLockup />

          <div className="hidden max-w-md flex-1 lg:block">
            <Suspense fallback={<div className="h-10 flex-1 rounded-full bg-sand-100" />}>
              <SearchOverlay categories={categories} />
            </Suspense>
          </div>

          <div className="flex flex-1 items-center justify-end gap-1 lg:flex-none">
            <Link
              href="/account"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-600 hover:bg-sabz-50 hover:text-sabz-700"
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
            <WishlistHeaderIcon />
            <CartHeaderIcon />
            <MiniCart />
          </div>
        </div>

        {/* Mobile search row: prominent, no drawer detour (SS-211). */}
        <div className="pb-3 lg:hidden">
          <Suspense fallback={<div className="h-9 rounded-md bg-sand-100" />}>
            <SearchInput inputId="search-mobile" />
          </Suspense>
        </div>

        <div className="hidden pb-2 lg:block">
          <DesktopNav categories={categories} />
        </div>
      </div>
    </header>
  );
}
