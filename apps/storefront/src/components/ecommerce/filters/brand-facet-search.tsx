'use client';

import { useId } from 'react';
import type { CatalogBrandDto } from '@sabz/types';
import { normalizeFa } from '@/lib/format';

/**
 * Local brand filtering over the already-loaded facet values (pure,
 * unit-tested). Empty query returns everything; matching uses Persian
 * normalization (ZWNJ, ي/ك folding, case, whitespace).
 */
export function filterBrandsByQuery(
  brands: CatalogBrandDto[],
  query: string,
): CatalogBrandDto[] {
  const normalized = normalizeFa(query);
  if (!normalized) {
    return brands;
  }
  return brands.filter((brand) => normalizeFa(brand.name).includes(normalized));
}

/**
 * Facet-local brand finder input (SS-212): controlled query field only —
 * filtering happens in the parent over the already-loaded brand list, so no
 * request per keystroke. RTL input with a clear button.
 */
export function BrandFacetSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const inputId = useId();

  return (
    <div className="relative mt-2">
      <label htmlFor={inputId} className="sr-only">
        جستجو در برندها
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="جستجو در برندها…"
        autoComplete="off"
        className="w-full rounded-md border-0 bg-sand-100 py-2 pe-9 ps-3 text-sm ring-1 ring-inset ring-sand-200 placeholder:text-gray-400 focus:ring-2 focus:ring-sabz-600"
      />
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 3.36 9.85l3.14 3.15a.75.75 0 1 0 1.06-1.06l-3.14-3.15A5.5 5.5 0 0 0 9 3.5Zm-4 5.5a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
          clipRule="evenodd"
        />
      </svg>
      {query ? (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label="پاک کردن جستجو"
          className="absolute end-1.5 top-1/2 inline-flex min-h-8 min-w-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 hover:text-gray-700"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}
