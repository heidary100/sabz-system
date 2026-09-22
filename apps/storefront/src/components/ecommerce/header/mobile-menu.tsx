'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';

/**
 * Mobile drawer (SS-124, SS-211). A real dialog: `role="dialog"` + `aria-modal`,
 * standard width, Escape closes, body scroll locks while open, focus moves in
 * on open (and back to the trigger on close) with a lightweight Tab trap. The
 * overlay is a plain click-catching div, not a full-screen button.
 * RTL-correct: the panel slides in from the right.
 */
export function MobileMenu({ categories }: { categories: CatalogCategoryNode[] }) {
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
        'a[href], button:not([disabled])',
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
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="relative -m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-700 hover:text-sabz-700"
      >
        <span className="sr-only">باز کردن منو</span>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
          <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="منوی فروشگاه" className="fixed inset-0 z-50">
          <div aria-hidden="true" onClick={() => close(false)} className="fixed inset-0 bg-black/25" />
          <div className="fixed inset-y-0 end-0 flex w-80 max-w-[85vw] flex-col overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 pt-5 pb-2">
              <BrandLockup />
              <button
                ref={closeRef}
                type="button"
                onClick={() => close()}
                className="relative -m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">بستن منو</span>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
                  <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <nav aria-label="ناوبری دسته‌بندی‌ها" className="px-4 pb-12">
              <p className="font-medium text-gray-900">دسته‌بندی‌ها</p>
              <ul role="list" className="mt-2">
                <li>
                  <Link
                    href="/categories"
                    onClick={() => close(false)}
                    className="flex w-full items-center py-2.5 text-sm font-semibold text-sabz-700 hover:text-sabz-800"
                  >
                    همه دسته‌بندی‌ها
                  </Link>
                </li>
                {categories.length === 0 ? (
                  <li className="py-2.5 text-sm text-gray-500">دسته‌بندی‌ای ثبت نشده است.</li>
                ) : (
                  categories.map((category) => (
                    <MobileCategoryNode key={category.id} node={category} depth={0} onNavigate={() => close(false)} />
                  ))
                )}
              </ul>

              <p className="mt-8 font-medium text-gray-900">پیوندها</p>
              <ul role="list" className="mt-4 space-y-2 text-gray-600">
                <li>
                  <Link href="/products" onClick={() => close(false)} className="block py-2.5 hover:text-sabz-700">
                    همه محصولات
                  </Link>
                </li>
                <li>
                  <Link href="/cart" onClick={() => close(false)} className="block py-2.5 hover:text-sabz-700">
                    سبد خرید
                  </Link>
                </li>
                <li>
                  <Link href="/account" onClick={() => close(false)} className="block py-2.5 hover:text-sabz-700">
                    حساب کاربری
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One accordion row: leaf renders a link; parents add an expandable child list. */
function MobileCategoryNode({
  node,
  depth,
  onNavigate,
}: {
  node: CatalogCategoryNode;
  depth: number;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;

  if (!hasChildren) {
    return (
      <li className="flex" style={{ paddingInlineStart: depth > 0 ? depth * 12 : 0 }}>
        <Link
          href={`/categories/${node.slug}`}
          onClick={onNavigate}
          className="flex w-full items-center justify-between py-2.5 text-gray-600 hover:text-sabz-700"
        >
          <span>{node.name}</span>
          <span className="text-xs text-gray-400">
            {formatFaNumber(node.publishedProductCount)}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li style={{ paddingInlineStart: depth > 0 ? depth * 12 : 0 }}>
      <div className="flex items-center gap-1">
        <Link
          href={`/categories/${node.slug}`}
          onClick={onNavigate}
          className="flex flex-1 items-center justify-between py-2.5 text-gray-600 hover:text-sabz-700"
        >
          <span>{node.name}</span>
          <span className="text-xs text-gray-400">
            {formatFaNumber(node.publishedProductCount)}
          </span>
        </Link>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`mobile-sub-${node.slug}`}
          aria-label={`زیرمجموعه‌های ${node.name}`}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-gray-500 hover:text-sabz-700"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`size-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      {expanded ? (
        <ul role="list" id={`mobile-sub-${node.slug}`}>
          {node.children.map((child) => (
            <MobileCategoryNode key={child.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
