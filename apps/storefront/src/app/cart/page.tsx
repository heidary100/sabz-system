import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'سبد خرید' };

/**
 * Cart UI placeholder (SS-124 binding decision): the full shopping-cart
 * surface exists from day one with an explicit Persian empty state; cart
 * functionality (add/update/remove) arrives in a later milestone.
 */
export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">سبد خرید</h1>

      <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-sabz-50 text-sabz-600">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-7">
              <path
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h2 className="mt-5 text-lg font-semibold text-ink-900">سبد خرید شما خالی است</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">
            هنوز محصولی به سبد خرید اضافه نکرده‌اید. از میان دسته‌بندی‌های فروشگاه
            دیدن کنید تا محصول مورد نظرتان را پیدا کنید.
          </p>
          <Link
            href="/products"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-sabz-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sabz-800"
          >
            رفتن به فروشگاه
            <span aria-hidden="true" className="ms-2">
              ←
            </span>
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-xs leading-5 text-gray-500">
        امکان افزودن به سبد خرید در مرحله بعدی توسعه فعال میشود.
      </p>
    </div>
  );
}
