'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTransitionMount } from '@/components/ecommerce/ui/use-transition-mount';
import type { CatalogBrandDto, CatalogCategoryNode } from '@sabz/types';
import type { ListingState } from '@/lib/listing';
import { getActivePills } from '@/lib/listing';
import { FiltersPanel } from './filters-panel';

/**
 * Mobile filter sheet (SS-226): the desktop sidebar's content in a
 * bottom-sheet dialog, so the 1,300px filter column never again sits above
 * the product grid on phones. The panel itself is the shared
 * `FiltersPanel` — every change still navigates through the canonical URL
 * builder, so the sheet simply stays open while the listing re-renders and
 * closes on demand.
 *
 * Dialog contract mirrors the SS-218 drawer: `role="dialog"` + `aria-modal`,
 * Escape closes, body scroll locks, focus moves in (trigger button) and back
 * to the opener on close, lightweight Tab trap. Portalled to body so the
 * header's `backdrop-blur` cannot capture the fixed layers.
 */
export function FiltersSheet({
  state,
  categories,
  brands,
  brandsTotal,
  basePath = '/products',
}: {
  state: ListingState;
  categories: CatalogCategoryNode[];
  brands: CatalogBrandDto[];
  brandsTotal?: number;
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeCount = getActivePills(state).length;
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
        'a[href], button:not([disabled]), input, select',
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
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-sand-200 bg-white px-4 text-sm font-semibold text-ink-900 shadow-sm hover:border-sabz-300"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4 text-sabz-600">
          <path d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z" />
        </svg>
        فیلترها
        {activeCount > 0 ? (
          <span className="rounded-full bg-sabz-700 px-2 py-0.5 text-[11px] font-semibold text-white">
            {activeCount.toLocaleString('fa-IR', { useGrouping: false })}
          </span>
        ) : null}
      </button>

      {shouldRender
        ? createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="فیلترهای محصولات"
              className="fixed inset-0 z-50"
            >
              <div
                aria-hidden="true"
                onClick={() => close(false)}
                data-state={animState}
                className="drawer-backdrop fixed inset-0 bg-ink-900/40 backdrop-blur-[2px]"
              />
              <div
                data-state={animState}
                className="sheet-panel fixed inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-sand-50 shadow-overlay"
              >
                <div className="flex items-center justify-between border-b border-sand-200 bg-white px-4 py-3">
                  <p className="text-sm font-bold text-ink-900">فیلترها</p>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => close()}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-gray-500 hover:bg-sand-100 hover:text-gray-700"
                  >
                    <span className="sr-only">بستن فیلترها</span>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-5">
                      <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <FiltersPanel
                    state={state}
                    categories={categories}
                    brands={brands}
                    brandsTotal={brandsTotal}
                    basePath={basePath}
                  />
                </div>

                <div className="border-t border-sand-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={() => close()}
                    className="min-h-12 w-full rounded-md bg-sabz-700 text-sm font-semibold text-white hover:bg-sabz-800"
                  >
                    نمایش نتایج
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
