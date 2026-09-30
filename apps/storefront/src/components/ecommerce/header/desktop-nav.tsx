'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { categoryHasChildren, navRoots, splitNavCategories } from '@/lib/nav';

/**
 * Desktop two-level navigation (SS-211): the browsable roots open a full-width
 * mega panel on hover *and* on keyboard focus, with a chevron toggle for
 * touch/keyboard users (`aria-expanded`, Escape closes and refocuses the
 * toggle). Leaf roots render as plain links. Overflow beyond
 * DESKTOP_NAV_LIMIT links to the `/categories` index.
 */
export function DesktopNav({ categories }: { categories: CatalogCategoryNode[] }) {
  const { visible, hasOverflow } = splitNavCategories(navRoots(categories));
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>());
  const pathname = usePathname();

  function openMenu(slug: string) {
    setOpenSlug(slug);
  }

  function closeMenu(returnFocus: boolean, slug: string | null) {
    setOpenSlug(null);
    if (returnFocus && slug) {
      toggleRefs.current.get(slug)?.focus();
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && openSlug) {
        closeMenu(true, openSlug);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openSlug]);

  useEffect(() => {
    // Route change with an open panel (browser back/forward while the layout
    // stays mounted): reset. Intentional external sync, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenSlug(null);
  }, [pathname]);

  const openCategory = visible.find((category) => category.slug === openSlug) ?? null;

  if (visible.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="ناوبری دسته‌بندی‌ها"
      className="relative hidden lg:block"
      onMouseLeave={() => closeMenu(false, null)}
      onBlur={(event) => {
        // Keyboard counterpart to onMouseLeave: if focus leaves the nav (and
        // its open panel), close without stealing focus back to the toggle.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeMenu(false, null);
        }
      }}
    >
      <ul role="list" className="flex items-center gap-1">
        {visible.map((category) =>
          categoryHasChildren(category) ? (
            <li
              key={category.id}
              onMouseEnter={() => openMenu(category.slug)}
              onFocus={() => openMenu(category.slug)}
            >
              <span
                className={`relative flex items-center whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-sabz-50 hover:text-sabz-800 ${
                  openSlug === category.slug ? 'bg-sabz-50 text-sabz-800' : 'text-gray-700'
                }`}
              >
                <Link
                  href={`/categories/${category.slug}`}
                  className="rounded-sm"
                  onClick={() => closeMenu(false, null)}
                >
                  {category.name}
                </Link>
                <button
                  ref={(el) => {
                    if (el) {
                      toggleRefs.current.set(category.slug, el);
                    } else {
                      toggleRefs.current.delete(category.slug);
                    }
                  }}
                  type="button"
                  aria-expanded={openSlug === category.slug}
                  aria-controls={`megamenu-${category.slug}`}
                  aria-label={`زیرمجموعه‌های ${category.name}`}
                  onClick={() =>
                    openSlug === category.slug ? closeMenu(false, null) : openMenu(category.slug)
                  }
                  className="-me-1.5 rounded-sm p-1.5 text-gray-500 hover:text-sabz-700"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className={`size-4 transition-transform ${openSlug === category.slug ? 'rotate-180' : ''}`}
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
                  className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-sabz-600 transition-opacity ${
                    openSlug === category.slug ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </span>
            </li>
          ) : (
            <li key={category.id}>
              <Link
                href={`/categories/${category.slug}`}
                className="group flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium text-gray-700 hover:bg-sabz-50 hover:text-sabz-800"
              >
                <span>{category.name}</span>
                <span className="rounded-full bg-sabz-50 px-1.5 py-0.5 text-[11px] font-semibold text-sabz-600">
                  {formatFaNumber(category.publishedProductCount)}
                </span>
              </Link>
            </li>
          ),
        )}
        {hasOverflow ? (
          <li>
            <Link
              href="/categories"
              className="rounded-md px-3 py-2 text-sm font-semibold text-sabz-700 hover:bg-sabz-50 hover:text-sabz-800"
            >
              همه دسته‌بندی‌ها
            </Link>
          </li>
        ) : null}
      </ul>

      {openCategory ? (
        <div id={`megamenu-${openCategory.slug}`} className="absolute inset-x-0 top-full z-50">
          <div className="animate-zoom-in origin-top overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-xl shadow-sabz-900/10">
            <div className="h-1 bg-gradient-to-l from-sabz-400 via-sabz-600 to-sabz-800" aria-hidden="true" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 p-6 xl:grid-cols-3">
              {openCategory.children.map((child) => (
                <div key={child.id}>
                  <Link
                    href={`/categories/${child.slug}`}
                    onClick={() => closeMenu(false, null)}
                    className="group flex items-center justify-between rounded-sm border-b border-sand-100 pb-2 text-sm font-bold text-ink-900 transition-colors hover:text-sabz-700"
                  >
                    <span className="transition-transform duration-300 ease-[var(--ease-swift)] group-hover:-translate-x-0.5">
                      {child.name}
                    </span>
                    <span className="rounded-full bg-sabz-50 px-2 py-0.5 text-[11px] font-semibold text-sabz-600">
                      {formatFaNumber(child.publishedProductCount)}
                    </span>
                  </Link>
                  {child.children.length > 0 ? (
                    <ul role="list" className="mt-2 space-y-0.5">
                      {child.children.map((grandchild) => (
                        <li key={grandchild.id}>
                          <Link
                            href={`/categories/${grandchild.slug}`}
                            onClick={() => closeMenu(false, null)}
                            className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-gray-600 transition-colors hover:bg-sabz-50 hover:text-sabz-800"
                          >
                            <span>{grandchild.name}</span>
                            <span className="text-xs text-gray-500">
                              {formatFaNumber(grandchild.publishedProductCount)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-sand-100 bg-sand-50 px-6 py-3">
              <Link
                href={`/categories/${openCategory.slug}`}
                onClick={() => closeMenu(false, null)}
                className="text-sm font-semibold text-sabz-700 hover:text-sabz-800"
              >
                مشاهده همه {openCategory.name} ←
              </Link>
              <Link
                href="/categories"
                onClick={() => closeMenu(false, null)}
                className="text-sm text-gray-500 hover:text-sabz-700"
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
