'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { buildSearchSubmitParams } from '@/lib/nav';

/**
 * Header search entry (SS-124, SS-211): submits on the current route with the
 * `q` URL param while preserving every other listing param
 * (category/brand/condition/sort) — the URL stays the single source of truth
 * for listing state. The form remounts on external `q` changes so back/forward
 * navigation never leaves stale text (no state-sync effect needed).
 */
export function SearchInput({
  compact = false,
  inputId = 'search',
}: {
  compact?: boolean;
  inputId?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';

  return (
    <SearchForm
      key={initialQ}
      pathname={pathname}
      searchParams={searchParams}
      initialQ={initialQ}
      compact={compact}
      inputId={inputId}
    />
  );
}

function SearchForm({
  pathname,
  searchParams,
  initialQ,
  compact,
  inputId,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  initialQ: string;
  compact: boolean;
  inputId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQ);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = buildSearchSubmitParams(searchParams, value.trim());
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <form onSubmit={submit} role="search" className="flex flex-1 gap-2">
      <label htmlFor={inputId} className="sr-only">
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
          id={inputId}
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
      <button
        type="submit"
        className="min-h-11 shrink-0 rounded-md bg-sabz-700 px-4 text-sm font-semibold text-white hover:bg-sabz-800"
      >
        جستجو
      </button>
    </form>
  );
}
