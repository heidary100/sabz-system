'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Suspense } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { navRoots } from '@/lib/nav';
import { SearchInput } from './search-input';

/**
 * Full-screen search overlay (SS-223), desktop only — the sabzsistem.com
 * pattern: a prominent input-looking trigger in the header opens a
 * dark-glass dialog with a large search field and popular-category chips.
 *
 * The dialog mirrors the SS-218 drawer contract: `role="dialog"` +
 * `aria-modal`, Escape closes, body scroll locks, focus moves in on open
 * (input first) and back to the trigger on close, lightweight Tab trap.
 * Portalled to body so the header's `backdrop-blur` cannot become the
 * containing block for the fixed layers.
 */
export function SearchOverlay({ categories }: { categories: CatalogCategoryNode[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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
      const items = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input',
      );
      if (items.length === 0) {
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
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
    // Focus lands on the input itself — searching is the only reason to be here.
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const quickCategories = navRoots(categories)
    .slice(0, 6)
    .filter((category) => category.publishedProductCount > 0);

  return (
    <div className="hidden lg:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group flex h-10 w-full items-center gap-2 rounded-full bg-sand-100 ps-4 pe-2 text-sm text-gray-500 ring-1 ring-inset ring-sand-200 transition-colors hover:bg-sand-100/70 hover:ring-sabz-300"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5 shrink-0 text-sabz-500">
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="flex-1 text-start">جستجو در محصولات…</span>
        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-gray-500 ring-1 ring-inset ring-sand-200 group-hover:text-sabz-700">
          جستجو
        </span>
      </button>

      {open
        ? createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="جستجوی محصولات"
              className="fixed inset-0 z-50"
            >
              <div
                aria-hidden="true"
                onClick={() => close(false)}
                className="fixed inset-0 bg-ink-950/60 backdrop-blur-sm"
              />
              <div className="relative mx-auto mt-24 w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-sand-200 bg-white p-6 shadow-overlay">
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => close()}
                  className="absolute -top-3 -start-3 inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-ink-950 p-2 text-white shadow-lift transition-colors hover:bg-ink-900"
                >
                  <span className="sr-only">بستن جستجو</span>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-4">
                    <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <Suspense fallback={<div className="h-12 rounded-full bg-sand-100" />}>
                  <SearchInput inputId="search-overlay" onSubmitted={() => close(false)} />
                </Suspense>
                <p className="mt-3 text-xs text-gray-500">
                  جستجو بر اساس نام کالا، برند یا کد کالا — نتیجه‌ها در همان صفحه فهرست
                  نمایش داده می‌شوند.
                </p>

                {quickCategories.length > 0 ? (
                  <div className="mt-6 border-t border-sand-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500">دسته‌های پرمخاطب</p>
                    <ul role="list" className="mt-3 flex flex-wrap gap-2">
                      {quickCategories.map((category) => (
                        <li key={category.id}>
                          <Link
                            href={`/categories/${category.slug}`}
                            onClick={() => close(false)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-sand-100 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-sabz-50 hover:text-sabz-700"
                          >
                            {category.name}
                            <span className="text-[10px] text-gray-500">
                              {formatFaNumber(category.publishedProductCount)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
