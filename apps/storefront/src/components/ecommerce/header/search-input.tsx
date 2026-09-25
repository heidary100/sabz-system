'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { buildSearchSubmitParams } from '@/lib/nav';
import { buttonVariants } from '@/components/ecommerce/ui/button';

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
  onSubmitted,
}: {
  compact?: boolean;
  inputId?: string;
  /** Called after a submit navigates — lets overlays close themselves. */
  onSubmitted?: () => void;
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
      onSubmitted={onSubmitted}
    />
  );
}

function SearchForm({
  pathname,
  searchParams,
  initialQ,
  compact,
  inputId,
  onSubmitted,
}: {
  pathname: string;
  searchParams: URLSearchParams;
  initialQ: string;
  compact: boolean;
  inputId: string;
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQ);

  // Clearing is a search submit with an empty q through the same
  // route-aware helper: q drops, page resets, other params survive.
  function submitSearch(nextValue: string) {
    const query = buildSearchSubmitParams(searchParams, nextValue.trim());
    router.push(query ? `${pathname}?${query}` : pathname);
    onSubmitted?.();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    submitSearch(value);
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
          className={`w-full rounded-md border-0 bg-sand-100 ps-10 pe-10 text-sm text-ink-900 ring-1 ring-inset ring-sand-200 placeholder:text-gray-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sabz-600 ${
            compact ? 'py-1.5' : 'py-2.5'
          }`}
        />
        {value ? (
          <button
            type="button"
            aria-label="پاک کردن جستجو"
            onClick={() => {
              setValue('');
              submitSearch('');
            }}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-gray-500 hover:text-ink-900"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        ) : null}
      </div>
      <button
        type="submit"
        className={`${buttonVariants()} shrink-0`}
      >
        جستجو
      </button>
    </form>
  );
}
