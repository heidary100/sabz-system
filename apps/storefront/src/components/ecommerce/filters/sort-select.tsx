'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { buildListingHref, CATALOG_SORTS, type ListingState } from '@/lib/listing';

const SORT_LABELS: Record<string, string> = {
  newest: 'جدیدترین',
  price_asc: 'ارزانترین',
  price_desc: 'گرانترین',
  name: 'الفبایی',
};

export function SortSelect({
  state,
  basePath = '/products',
}: {
  state: ListingState;
  basePath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={pending ? 'opacity-60' : ''}>
      <label htmlFor="sort" className="sr-only">
        ترتیب نمایش
      </label>
      <select
        id="sort"
        value={state.sort}
        onChange={(event) => {
          const sort = event.target.value as ListingState['sort'];
          startTransition(() => {
            router.push(buildListingHref(basePath, state, { sort }));
          });
        }}
        className="rounded-md border-0 bg-white py-2 pe-8 ps-3 text-sm ring-1 ring-inset ring-sand-200 focus:ring-2 focus:ring-sabz-600"
      >
        {CATALOG_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </select>
    </div>
  );
}
