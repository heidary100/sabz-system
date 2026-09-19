'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { SearchInput } from './search-input';

/**
 * Mobile drawer (SS-124). RTL-correct: the panel slides in from the right,
 * mirroring the admin drawer pattern. Categories come from the public
 * catalog API with their published-product counts.
 */
export function MobileMenu({ categories }: { categories: CatalogCategoryNode[] }) {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative -m-2 inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:text-sabz-700"
      >
        <span className="sr-only">باز کردن منو</span>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
          <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="بستن منو"
            onClick={close}
            className="fixed inset-0 bg-black/25"
          />
          <div className="fixed inset-y-0 end-0 flex max-w-full flex-col overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 pt-5 pb-2">
              <span className="text-lg font-bold text-sabz-800">سبز سیستم</span>
              <button
                type="button"
                onClick={close}
                className="relative -m-2 inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:text-gray-500"
              >
                <span className="sr-only">بستن منو</span>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
                  <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="mt-2 px-4 pb-4">
              <Suspense fallback={<div className="h-8 rounded-md bg-sand-100" />}>
                <SearchInput compact />
              </Suspense>
            </div>

            <nav aria-label="ناوبری دسته‌بندی‌ها" className="px-4 pb-12">
              <p className="font-medium text-gray-900">دسته‌بندی‌ها</p>
              <ul role="list" className="mt-4 space-y-2">
                {categories.length === 0 ? (
                  <li className="text-sm text-gray-500">دسته‌بندی‌ای ثبت نشده است.</li>
                ) : (
                  categories.map((category) => (
                    <li key={category.id} className="flex">
                      <Link
                        href={`/categories/${category.slug}`}
                        onClick={close}
                        className="flex w-full items-center justify-between py-1.5 text-gray-600 hover:text-sabz-700"
                      >
                        <span>{category.name}</span>
                        <span className="text-xs text-gray-400">
                          {formatFaNumber(category.publishedProductCount)}
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>

              <p className="mt-8 font-medium text-gray-900">پیوندها</p>
              <ul role="list" className="mt-4 space-y-2 text-gray-600">
                <li>
                  <Link href="/products" onClick={close} className="py-1.5 hover:text-sabz-700">
                    همه محصولات
                  </Link>
                </li>
                <li>
                  <Link href="/cart" onClick={close} className="py-1.5 hover:text-sabz-700">
                    سبد خرید
                  </Link>
                </li>
                <li>
                  <Link href="/account" onClick={close} className="py-1.5 hover:text-sabz-700">
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
