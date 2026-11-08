import Link from 'next/link';
import { Suspense } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';
import { CartHeaderIcon } from '@/components/ecommerce/cart/cart-header-icon';
import { CompareHeaderIcon } from '@/components/ecommerce/compare/compare-header-icon';
import { MiniCart } from '@/components/ecommerce/cart/mini-cart';
import { DesktopNav } from './desktop-nav';
import { MobileMenu } from './mobile-menu';
import { SearchOverlay } from './search-overlay';
import { NotificationHeaderIcon } from './notification-header-icon';
import { WishlistHeaderIcon } from './wishlist-header-icon';
import { ThemeToggle } from '@/components/ecommerce/theme/theme-toggle';

/**
 * Storefront shell header (Task 03). Two deliberate rows:
 * 1. brand, prominent search and customer utilities;
 * 2. category navigation with a two-level mega panel.
 *
 * Mobile collapses to menu / brand / search / cart; every other utility
 * remains in the drawer. The header stays a server component; only the
 * interactive menu, search and theme controls are client islands.
 */
export function SiteHeader({
  categories,
  covers,
}: {
  categories: CatalogCategoryNode[];
  covers: Record<string, string | null>;
}) {
  return (
    <header className="site-header sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-2 sm:gap-3">
          <MobileMenu categories={categories} covers={covers} />

          <BrandLockup />

          <div className="hidden min-w-0 flex-1 lg:block lg:max-w-xl">
            <Suspense
              fallback={<div className="h-11 rounded-pill bg-surface-2" />}
            >
              <SearchOverlay categories={categories} />
            </Suspense>
          </div>

          <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
            <div className="hidden items-center gap-0.5 lg:flex">
              <Link
                href="/account"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-control p-2 text-fg-secondary transition-colors hover:bg-accent-soft hover:text-accent"
              >
                <span className="sr-only">حساب کاربری</span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                  className="size-6"
                >
                  <path
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <WishlistHeaderIcon />
              <NotificationHeaderIcon />
              <CompareHeaderIcon />
              <ThemeToggle />
            </div>

            <div className="flex items-center lg:hidden">
              <Suspense fallback={<span className="size-11" />}>
                <SearchOverlay categories={categories} mobile />
              </Suspense>
            </div>

            <CartHeaderIcon />
            <MiniCart />
          </div>
        </div>

        <div className="hidden pb-1.5 lg:block">
          <DesktopNav categories={categories} covers={covers} />
        </div>
      </div>
    </header>
  );
}
