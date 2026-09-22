'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  buildListingHref,
  LISTING_PER_PAGE_OPTIONS,
  type ListingState,
} from '@/lib/listing';
import { formatFaNumber } from '@/lib/format';

/**
 * Page-size selector (SS-213, UI layer): 12 / 24 / 48, default 24.
 * Navigates via the canonical `buildListingHref(basePath, …)` so changing
 * per-page preserves every filter and the category pathname while resetting
 * to page 1. The `perPage` state is translated to the API `limit` upstream.
 */
export function PerPageSelect({
  state,
  basePath = '/products',
}: {
  state: ListingState;
  basePath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectId = useId();

  return (
    <div className={pending ? 'opacity-60' : ''}>
      <label htmlFor={selectId} className="sr-only">
        تعداد کالا در هر صفحه
      </label>
      <select
        id={selectId}
        value={state.perPage}
        onChange={(event) => {
          const perPage = Number.parseInt(event.target.value, 10);
          startTransition(() => {
            router.push(buildListingHref(basePath, state, { perPage }));
          });
        }}
        className="rounded-md border-0 bg-white py-2 pe-8 ps-3 text-sm ring-1 ring-inset ring-sand-200 focus:ring-2 focus:ring-sabz-600"
      >
        {LISTING_PER_PAGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {formatFaNumber(option)} در صفحه
          </option>
        ))}
      </select>
    </div>
  );
}
