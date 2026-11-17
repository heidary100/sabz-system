'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import {
  categoryHasChildren,
  navRoots,
  splitNavCategories,
  visibleCategoryChildren,
} from '@/lib/nav';
import { CategoryCover } from './category-cover';

const HOVER_INTENT_MS = 120;
const CLOSE_GRACE_MS = 140;
const COMPACT_VISIBLE = 5;

/**
 * Desktop navigation (Task 03): a restrained second-row category bar with a
 * two-level editorial mega panel. Pointer entry uses a short intent delay;
 * focus/click opens immediately. Escape closes and restores focus to the
 * toggle; route changes and outside pointer interaction close the panel.
 */
export function DesktopNav({
  categories,
  covers,
}: {
  categories: CatalogCategoryNode[];
  covers: Record<string, string | null>;
}) {
  const roots = navRoots(categories);
  const { visible, hasOverflow } = splitNavCategories(roots);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const moveFocusRef = useRef(false);
  const pathname = usePathname();

  const clearTimers = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  function openMenu(slug: string, moveFocus = false) {
    clearTimers();
    moveFocusRef.current = moveFocus;
    setOpenSlug(slug);
  }

  const closeMenu = useCallback(
    (returnFocus: boolean, slug: string | null) => {
      clearTimers();
      setOpenSlug(null);
      if (returnFocus && slug) {
        toggleRefs.current.get(slug)?.focus();
      }
    },
    [clearTimers],
  );

  function scheduleOpen(slug: string) {
    clearTimers();
    hoverTimer.current = setTimeout(() => openMenu(slug), HOVER_INTENT_MS);
  }

  function scheduleClose() {
    clearTimers();
    closeTimer.current = setTimeout(() => closeMenu(false, null), CLOSE_GRACE_MS);
  }

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!openSlug || !moveFocusRef.current) {
      return;
    }
    moveFocusRef.current = false;
    panelRef.current
      ?.querySelector<HTMLElement>('a[href], button:not([disabled])')
      ?.focus();
  }, [openSlug]);

  useEffect(() => {
    if (!openSlug) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu(true, openSlug);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) {
        closeMenu(false, null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openSlug, closeMenu]);

  useEffect(() => {
    // Browser back/forward with the panel open: reset without moving focus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenSlug(null);
  }, [pathname]);

  const openCategory =
    visible.find((category) => category.slug === openSlug) ?? null;
  const openChildren = openCategory
    ? visibleCategoryChildren(openCategory)
    : [];
  const shownChildren = openChildren.slice(0, 9);
  const hiddenChildren = openChildren.length - shownChildren.length;
  const isActive = (slug: string) =>
    pathname === `/categories/${slug}` ||
    pathname.startsWith(`/categories/${slug}/`);

  if (visible.length === 0) {
    return null;
  }

  return (
    <nav
      ref={navRef}
      aria-label="ناوبری دسته‌بندی‌ها"
      className="relative hidden lg:block"
      onPointerLeave={scheduleClose}
      onPointerEnter={clearTimers}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeMenu(false, null);
        }
      }}
    >
      <ul role="list" className="flex items-center gap-0.5">
        {visible.map((category, index) => {
          const active = isActive(category.slug);
          const responsiveClass =
            index >= COMPACT_VISIBLE ? 'hidden xl:flex' : 'flex';
          const linkClass = `relative flex items-center whitespace-nowrap rounded-control px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-accent-soft hover:text-accent ${
            active || openSlug === category.slug
              ? 'bg-accent-soft text-accent'
              : 'text-fg-secondary'
          }`;

          if (!categoryHasChildren(category)) {
            return (
              <li key={category.id} className={responsiveClass}>
                <Link
                  href={`/categories/${category.slug}`}
                  aria-current={active ? 'page' : undefined}
                  className={`${linkClass} gap-1.5`}
                >
                  {category.name}
                  <span className="hidden rounded-pill bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-fg-muted ring-1 ring-inset ring-border xl:inline">
                    {formatFaNumber(category.publishedProductCount)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-2 -bottom-0.5 h-0.5 rounded-pill bg-accent transition-opacity ${
                      active ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                </Link>
              </li>
            );
          }

          return (
            <li
              key={category.id}
              className={`${responsiveClass} items-center`}
              onPointerEnter={() => scheduleOpen(category.slug)}
            >
              <span className={linkClass}>
                <Link
                  href={`/categories/${category.slug}`}
                  aria-current={active ? 'page' : undefined}
                  className="rounded-control"
                  onClick={() => closeMenu(false, null)}
                >
                  {category.name}
                </Link>
                <button
                  ref={(element) => {
                    if (element) {
                      toggleRefs.current.set(category.slug, element);
                    } else {
                      toggleRefs.current.delete(category.slug);
                    }
                  }}
                  type="button"
                  aria-expanded={openSlug === category.slug}
                  aria-controls={`megamenu-${category.slug}`}
                  aria-label={`زیرمجموعه‌های ${category.name}`}
                  onClick={() =>
                    openSlug === category.slug
                      ? closeMenu(false, null)
                      : openMenu(category.slug, true)
                  }
                  className="-me-1 rounded-control p-1 text-fg-muted hover:text-accent"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className={`size-3.5 transition-transform duration-200 ${
                      openSlug === category.slug ? 'rotate-180' : ''
                    }`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-2 -bottom-0.5 h-0.5 rounded-pill bg-accent transition-opacity ${
                    active || openSlug === category.slug
                      ? 'opacity-100'
                      : 'opacity-0'
                  }`}
                />
              </span>
            </li>
          );
        })}

        {roots.length > COMPACT_VISIBLE ? (
          <li className="xl:hidden">
            <Link
              href="/categories"
              className="whitespace-nowrap rounded-control px-2.5 py-2 text-[13px] font-semibold text-accent hover:bg-accent-soft"
            >
              همه دسته‌بندی‌ها
            </Link>
          </li>
        ) : null}
        {hasOverflow ? (
          <li className="hidden xl:flex">
            <Link
              href="/categories"
              className="whitespace-nowrap rounded-control px-2.5 py-2 text-[13px] font-semibold text-accent hover:bg-accent-soft"
            >
              همه دسته‌بندی‌ها
            </Link>
          </li>
        ) : null}
      </ul>

      {openCategory ? (
        <div
          ref={panelRef}
          id={`megamenu-${openCategory.slug}`}
          className="absolute inset-x-0 top-full z-50 pt-1"
        >
          <div className="animate-zoom-in origin-top overflow-hidden rounded-panel border border-border bg-surface shadow-overlay">
            <div className="grid grid-cols-[17rem_minmax(0,1fr)]">
              <div className="border-e border-border bg-surface-2 p-4">
                <CategoryCover
                  src={covers[openCategory.slug] ?? null}
                  name={openCategory.name}
                  variant="feature"
                />
                <p className="mt-3 text-[11px] font-medium text-fg-muted">
                  دسته‌بندی
                </p>
                <p className="mt-0.5 text-base font-extrabold text-fg">
                  {openCategory.name}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  {formatFaNumber(openCategory.publishedProductCount)} کالا
                </p>
                <Link
                  href={`/categories/${openCategory.slug}`}
                  onClick={() => closeMenu(false, null)}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover"
                >
                  مشاهده محصولات {openCategory.name}
                </Link>
              </div>

              <div className="max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain p-5">
                {shownChildren.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                    {shownChildren.map((child) => {
                      const grandchildren = visibleCategoryChildren(child).slice(
                        0,
                        6,
                      );
                      const remaining =
                        visibleCategoryChildren(child).length -
                        grandchildren.length;
                      return (
                        <section key={child.id} aria-labelledby={`mega-${child.id}`}>
                          <Link
                            id={`mega-${child.id}`}
                            href={`/categories/${child.slug}`}
                            onClick={() => closeMenu(false, null)}
                            className="flex items-start justify-between gap-2 border-b border-border pb-2 text-[13px] font-bold text-fg transition-colors hover:text-accent"
                          >
                            <span>{child.name}</span>
                            <span className="shrink-0 text-[10px] font-medium text-fg-muted">
                              {formatFaNumber(child.publishedProductCount)}
                            </span>
                          </Link>
                          {grandchildren.length > 0 ? (
                            <ul role="list" className="mt-2 space-y-0.5">
                              {grandchildren.map((grandchild) => (
                                <li key={grandchild.id}>
                                  <Link
                                    href={`/categories/${grandchild.slug}`}
                                    onClick={() => closeMenu(false, null)}
                                    className="flex min-h-8 items-center justify-between gap-2 rounded-control px-1.5 py-1 text-xs text-fg-secondary transition-colors hover:bg-accent-soft hover:text-accent"
                                  >
                                    <span className="line-clamp-2">
                                      {grandchild.name}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-fg-muted">
                                      {formatFaNumber(
                                        grandchild.publishedProductCount,
                                      )}
                                    </span>
                                  </Link>
                                </li>
                              ))}
                              {remaining > 0 ? (
                                <li>
                                  <Link
                                    href={`/categories/${child.slug}`}
                                    onClick={() => closeMenu(false, null)}
                                    className="inline-flex min-h-8 items-center px-1.5 text-[11px] font-medium text-accent hover:text-accent-hover"
                                  >
                                    {formatFaNumber(remaining)} زیرمجموعه دیگر…
                                  </Link>
                                </li>
                              ) : null}
                            </ul>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-fg-muted">
                    زیرمجموعه فعالی برای این دسته ثبت نشده است.
                  </p>
                )}
                {hiddenChildren > 0 ? (
                  <Link
                    href={`/categories/${openCategory.slug}`}
                    onClick={() => closeMenu(false, null)}
                    className="mt-5 inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:text-accent-hover"
                  >
                    {formatFaNumber(hiddenChildren)} زیرمجموعه دیگر…
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border bg-surface-2 px-5 py-2.5">
              <Link
                href={`/categories/${openCategory.slug}`}
                onClick={() => closeMenu(false, null)}
                className="text-xs font-semibold text-accent hover:text-accent-hover"
              >
                مشاهده همه {openCategory.name} ←
              </Link>
              <Link
                href="/categories"
                onClick={() => closeMenu(false, null)}
                className="text-xs text-fg-muted hover:text-accent"
              >
                همه دسته‌بندی‌ها
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
