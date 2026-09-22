'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { categoryHasChildren, splitNavCategories } from '@/lib/nav';

/**
 * Desktop two-level navigation (SS-211): top-level links with a JS-controlled
 * disclosure toggle for parents (`aria-expanded`, Escape closes, outside click
 * closes). Childless categories render as plain links. Overflow beyond
 * DESKTOP_NAV_LIMIT links to the `/categories` index.
 */
export function DesktopNav({ categories }: { categories: CatalogCategoryNode[] }) {
  const { visible, hasOverflow } = splitNavCategories(categories);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const openRef = useRef<string | null>(null);
  const toggleRefs = useRef(new Map<string, HTMLButtonElement>());

  function openMenu(slug: string) {
    openRef.current = slug;
    setOpenSlug(slug);
  }

  const closeMenu = useCallback(() => {
    const prev = openRef.current;
    openRef.current = null;
    setOpenSlug(null);
    if (prev) {
      toggleRefs.current.get(prev)?.focus();
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeMenu]);

  if (visible.length === 0) {
    return null;
  }

  return (
    <nav aria-label="ناوبری دسته‌بندی‌ها" className="hidden lg:block">
      <ul role="list" className="flex items-center gap-1">
        {visible.map((category) =>
          categoryHasChildren(category) ? (
            <li key={category.id} className="relative">
              <span className="group flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-sabz-50 hover:text-sabz-800">
                <Link
                  href={`/categories/${category.slug}`}
                  className="rounded-sm"
                  onClick={() => openRef.current !== null && closeMenu()}
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
                  aria-controls={`submenu-${category.slug}`}
                  aria-label={`زیرمجموعه‌های ${category.name}`}
                  onClick={() =>
                    openSlug === category.slug ? closeMenu() : openMenu(category.slug)
                  }
                  className="-me-1 rounded-sm p-1 text-gray-500 hover:text-sabz-700"
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
              </span>
              {openSlug === category.slug ? (
                <div
                  id={`submenu-${category.slug}`}
                  className="absolute top-full start-0 z-50 min-w-60 rounded-xl border border-sand-200 bg-white p-2 shadow-lg"
                >
                  <ul role="list" className="max-h-96 overflow-y-auto">
                    <li>
                      <Link
                        href={`/categories/${category.slug}`}
                        onClick={() => closeMenu()}
                        className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-sabz-800 hover:bg-sabz-50"
                      >
                        <span>همه {category.name}</span>
                        <span className="text-xs font-normal text-gray-400">
                          {formatFaNumber(category.publishedProductCount)}
                        </span>
                      </Link>
                    </li>
                    {category.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/categories/${child.slug}`}
                          onClick={() => closeMenu()}
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-sabz-50 hover:text-sabz-800"
                        >
                          <span>{child.name}</span>
                          <span className="text-xs text-gray-400">
                            {formatFaNumber(child.publishedProductCount)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ) : (
            <li key={category.id}>
              <Link
                href={`/categories/${category.slug}`}
                className="group flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-sabz-50 hover:text-sabz-800"
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
    </nav>
  );
}
