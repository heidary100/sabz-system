'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { navRoots } from '@/lib/nav';
import { BrandLockup } from '@/components/ecommerce/brand/brand-lockup';
import { ThemeToggle } from '@/components/ecommerce/theme/theme-toggle';
import { useTransitionMount } from '@/components/ecommerce/ui/use-transition-mount';

/**
 * Mobile drawer (SS-124, SS-211, animated SS-246). A real dialog:
 * `role="dialog"` + `aria-modal`, standard width, Escape closes, body scroll
 * locks while open, focus moves in on open (and back to the trigger on
 * close) with a lightweight Tab trap. The overlay is a plain click-catching
 * div, not a full-screen button. RTL-correct: the panel slides in from the
 * start (right) side, out through the same choreography as the mini-cart.
 */
export function MobileMenu({ categories }: { categories: CatalogCategoryNode[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const roots = navRoots(categories);
  const [shouldRender, animState] = useTransitionMount(open);

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
        className="relative -m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-control p-2 text-fg-secondary hover:text-accent"
      >
        <span className="sr-only">باز کردن منو</span>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
          <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {shouldRender ? (
        createPortal(
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="منوی فروشگاه" className="fixed inset-0 z-50">
          <div
            aria-hidden="true"
            onClick={() => close(false)}
            data-state={animState}
            className="drawer-backdrop fixed inset-0 bg-overlay"
          />
          <div
            data-state={animState}
            className="drawer-panel fixed inset-y-0 start-0 flex w-80 max-w-[85vw] flex-col overflow-hidden rounded-e-panel bg-surface shadow-overlay"
          >
            <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-3">
              <BrandLockup />
              <button
                ref={closeRef}
                type="button"
                onClick={() => close()}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-surface p-2 text-fg-muted ring-1 ring-inset ring-border hover:text-fg-secondary"
              >
                <span className="sr-only">بستن منو</span>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-5">
                  <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <nav aria-label="ناوبری دسته‌بندی‌ها" className="flex-1 overscroll-contain overflow-y-auto px-4 py-4">
              <Link
                href="/categories"
                onClick={() => close(false)}
                className="flex min-h-12 w-full items-center justify-center rounded-card bg-accent text-sm font-bold text-on-accent hover:bg-accent-hover"
              >
                مشاهده همه دسته‌بندی‌ها
              </Link>

              <p className="mt-6 mb-1 px-1 text-xs font-semibold text-fg-muted">دسته‌بندی‌ها</p>
              {roots.length === 0 ? (
                <p className="px-1 py-3 text-sm text-fg-muted">دسته‌بندی‌ای ثبت نشده است.</p>
              ) : (
                <ul role="list" className="divide-y divide-border rounded-panel border border-border bg-surface">
                  {roots.map((category) => (
                    <MobileCategoryNode key={category.id} node={category} depth={0} onNavigate={() => close(false)} />
                  ))}
                </ul>
              )}

              <p className="mt-6 mb-1 px-1 text-xs font-semibold text-fg-muted">پیوندها</p>
              <ul role="list" className="divide-y divide-border rounded-card border border-border bg-surface text-fg-secondary">
                {[
                  { href: '/products', label: 'همه محصولات' },
                  { href: '/cart', label: 'سبد خرید' },
                  { href: '/account', label: 'حساب کاربری' },
                ].map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} onClick={() => close(false)} className="flex min-h-12 items-center px-4 text-sm hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>

              <ThemeToggle variant="inline" className="mt-6 px-1" />
            </nav>
          </div>
          </div>,
          // Portalled out of the sticky header: its header styles would
          // otherwise become the containing block for these `fixed` nodes and
          // squash the drawer to header height. `open` starts false, so this
          // never diverges from the server render.
          document.body,
        )
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
      <li>
        <Link
          href={`/categories/${node.slug}`}
          onClick={onNavigate}
          className="flex min-h-12 w-full items-center justify-between gap-2 px-4 text-sm text-fg-secondary hover:text-accent"
          style={{ paddingInlineStart: 16 + depth * 12 }}
        >
          <span>{node.name}</span>
          <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">
            {formatFaNumber(node.publishedProductCount)}
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li className={expanded ? 'bg-surface-2' : undefined}>
      <div className="flex items-center gap-1 pe-2" style={{ paddingInlineStart: 8 + depth * 12 }}>
        <Link
          href={`/categories/${node.slug}`}
          onClick={onNavigate}
          className="flex min-h-12 flex-1 items-center justify-between gap-2 px-2 text-sm font-semibold text-fg hover:text-accent"
        >
          <span>{node.name}</span>
          <span className="rounded-pill bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
            {formatFaNumber(node.publishedProductCount)}
          </span>
        </Link>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`mobile-sub-${node.slug}`}
          aria-label={`زیرمجموعه‌های ${node.name}`}
          onClick={() => setExpanded((value) => !value)}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-pill p-2 transition-colors ${
            expanded ? 'bg-accent text-on-accent' : 'bg-surface text-fg-muted ring-1 ring-inset ring-border hover:text-accent'
          }`}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
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
        <ul role="list" id={`mobile-sub-${node.slug}`} className="border-t border-border pb-1">
          {node.children.map((child) => (
            <MobileCategoryNode key={child.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
