'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * Header search entry (SS-124): submits to the listing page with the `q`
 * URL param, which is the single source of truth for listing state.
 */
export function SearchInput({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    router.push(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : '/products');
  }

  return (
    <form onSubmit={submit} role="search" className="flex flex-1">
      <label htmlFor="search" className="sr-only">
        جستجوی محصولات
      </label>
      <div className="relative w-full">
        <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-sabz-500">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <input
          id="search"
          name="q"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="جستجو در محصولات…"
          className={`w-full rounded-md border-0 bg-sand-100 ps-10 pe-4 text-sm text-ink-900 ring-1 ring-inset ring-sand-200 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sabz-600 ${
            compact ? 'py-1.5' : 'py-2.5'
          }`}
        />
      </div>
    </form>
  );
}
