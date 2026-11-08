'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import {
  categoryHasChildren,
  navRoots,
  visibleCategoryChildren,
} from '@/lib/nav';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';
import { ThemeToggle } from '@/components/ecommerce/theme/theme-toggle';
import { useTransitionMount } from '@/components/ecommerce/ui/use-transition-mount';
import { CategoryCover } from './category-cover';

const UTILITY_LINKS = [
  { href: '/products', label: 'همه محصولات' },
  { href: '/cart', label: 'سبد خرید' },
  { href: '/account', label: 'حساب کاربری' },
  { href: '/wishlist', label: 'علاقه‌مندی‌ها' },
  { href: '/compare', label: 'مقایسه محصولات' },
  { href: '/notifications', label: 'اعلان‌ها' },
] as const;

/**
 * Mobile category drawer (Task 03). A genuine accessible dialog with an
 * explicit drill-down stack rather than an inline accordion: root → children
 * → deeper levels, with back/breadcrumb, a products link for parents that
 * also have children, and the existing scroll/focus/escape contract.
 */
export function MobileMenu({
  categories,
  covers,
}: {
  categories: CatalogCategoryNode[];
  covers: Record<string, string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [stack, setStack] = useState<CatalogCategoryNode[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const roots = navRoots(categories);
  const [shouldRender, animState] = useTransitionMount(open);

  const current = stack.length > 0 ? stack[stack.length - 1]! : null;
  const items = current ? visibleCategoryChildren(current) : roots;

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
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
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
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
  }, [open, shouldRender, close]);

  // A level change removes the row that was focused; move focus to the back
  // control (or close on root) so keyboard users are never dropped to body.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (stack.length > 0) {
      backRef.current?.focus();
    } else {
      closeRef.current?.focus();
    }
  }, [open, shouldRender, stack.length]);

  function back(): void {
    setStack((value) => value.slice(0, -1));
  }

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="relative -m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-control p-2 text-fg-secondary hover:text-accent"
      >
        <span className="sr-only">باز کردن منو</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
          className="size-6"
        >
          <path
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {shouldRender
        ? createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="منوی فروشگاه"
              className="fixed inset-0 z-50"
            >
              <div
                aria-hidden="true"
                onClick={() => close()}
                data-state={animState}
                className="drawer-backdrop fixed inset-0 bg-overlay"
              />
              <div
                data-state={animState}
                className="drawer-panel fixed inset-y-0 start-0 flex w-80 max-w-[88vw] flex-col overflow-hidden rounded-e-panel bg-surface shadow-overlay"
              >
                <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
                  <BrandLockup />
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => close()}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-surface p-2 text-fg-muted ring-1 ring-inset ring-border-control hover:text-fg"
                  >
                    <span className="sr-only">بستن منو</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      aria-hidden="true"
                      className="size-5"
                    >
                      <path
                        d="M6 18 18 6M6 6l12 12"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <nav
                  aria-label="ناوبری دسته‌بندی‌ها"
                  className="flex-1 overscroll-contain overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
                >
                  <div className="flex min-h-8 items-center gap-2">
                    {current ? (
                      <>
                        <button
                          ref={backRef}
                          type="button"
                          onClick={back}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-2 hover:text-fg"
                        >
                          <span className="sr-only">بازگشت به سطح قبل</span>
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                            className="size-4"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L10.94 10 7.22 6.28a.75.75 0 0 1 0-1.06Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                        <p className="min-w-0 truncate text-[11px] text-fg-muted">
                          {stack.map((node) => node.name).join(' / ')}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs font-semibold text-fg-muted">
                        دسته‌بندی‌ها
                      </p>
                    )}
                  </div>

                  {current ? (
                    <Link
                      href={`/categories/${current.slug}`}
                      onClick={() => close(false)}
                      className="mt-2 flex min-h-11 items-center justify-between gap-2 rounded-control bg-accent-soft px-3 text-xs font-semibold text-accent"
                    >
                      <span>مشاهده محصولات {current.name}</span>
                      <span className="text-[10px] text-fg-muted">
                        {formatFaNumber(current.publishedProductCount)} کالا
                      </span>
                    </Link>
                  ) : (
                    <Link
                      href="/categories"
                      onClick={() => close(false)}
                      className="mt-2 flex min-h-11 items-center justify-center rounded-control border border-border bg-surface-2 px-3 text-xs font-semibold text-fg-secondary hover:border-accent hover:text-accent"
                    >
                      مشاهده همه دسته‌بندی‌ها
                    </Link>
                  )}

                  {items.length === 0 ? (
                    <p className="px-1 py-4 text-sm text-fg-muted">
                      زیرمجموعه فعالی ثبت نشده است.
                    </p>
                  ) : (
                    <ul
                      role="list"
                      className="mt-3 divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface"
                    >
                      {items.map((node) => (
                        <li key={node.id}>
                          <MobileCategoryRow
                            node={node}
                            cover={covers[node.slug] ?? null}
                            onOpen={() => setStack((value) => [...value, node])}
                            onNavigate={() => close()}
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-6 mb-1 px-1 text-[11px] font-semibold text-fg-muted">
                    پیوندها
                  </p>
                  <ul
                    role="list"
                    className="divide-y divide-border rounded-panel border border-border bg-surface text-fg-secondary"
                  >
                    {UTILITY_LINKS.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          onClick={() => close(false)}
                          className="flex min-h-12 items-center px-4 text-sm hover:text-accent"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <ThemeToggle variant="inline" className="mt-6 px-1" />
                </nav>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function MobileCategoryRow({
  node,
  cover,
  onOpen,
  onNavigate,
}: {
  node: CatalogCategoryNode;
  cover: string | null;
  onOpen: () => void;
  onNavigate: () => void;
}) {
  const content = (
    <>
      <CategoryCover src={cover} name={node.name} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{node.name}</span>
        <span className="mt-0.5 block text-[11px] text-fg-muted">
          {formatFaNumber(node.publishedProductCount)} کالا
        </span>
      </span>
    </>
  );

  if (categoryHasChildren(node)) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-surface-2"
      >
        {content}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="size-4 shrink-0 text-fg-muted"
        >
          <path
            fillRule="evenodd"
            d="M12.78 5.22a.75.75 0 0 0-1.06 0L7.47 9.47a.75.75 0 0 0 0 1.06l4.25 4.25a.75.75 0 1 0 1.06-1.06L9.06 10l3.72-3.72a.75.75 0 0 0 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    );
  }

  return (
    <Link
      href={`/categories/${node.slug}`}
      onClick={onNavigate}
      className="flex min-h-14 items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-2"
    >
      {content}
    </Link>
  );
}
