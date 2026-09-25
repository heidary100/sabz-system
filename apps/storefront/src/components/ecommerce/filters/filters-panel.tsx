'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { CatalogBrandDto, CatalogCategoryNode } from '@sabz/types';
import { buildListingHref, type ListingState } from '@/lib/listing';
import { CONDITION_OPTIONS } from '@/lib/condition';
import { formatFaNumber } from '@/lib/format';
import { FACET_DEFAULT_VISIBLE, findCategoryNode, navRoots } from '@/lib/nav';
import { FacetSection } from './facet-section';
import { BrandFacetSearch, filterBrandsByQuery } from './brand-facet-search';
import { PriceFacet } from './price-facet';

/**
 * Listing filter controls (SS-125, SS-212, SS-213): URL search params are the
 * single source of truth — every change pushes a new href via the canonical
 * `buildListingHref(basePath, …)` and resets the page. `basePath` keeps the
 * same component mountable at `/products` and `/categories/<slug>` with the
 * category context preserved (the slug never leaks into the query string).
 * Facets never truncate silently: overflow always gets an explicit
 * show-more toggle, and brand search filters the loaded list locally.
 */
export function FiltersPanel({
  state,
  categories,
  brands,
  brandsTotal,
  basePath = '/products',
}: {
  state: ListingState;
  categories: CatalogCategoryNode[];
  brands: CatalogBrandDto[];
  /** Total brand count from the API (may exceed the loaded page). */
  brandsTotal?: number;
  basePath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [brandQuery, setBrandQuery] = useState('');

  function apply(changes: Partial<ListingState>) {
    startTransition(() => {
      router.push(buildListingHref(basePath, state, changes));
    });
  }

  const roots = navRoots(categories);
  const selectedCategory = state.category
    ? findCategoryNode(categories, state.category)
    : null;

  const filteredBrands = useMemo(
    () => filterBrandsByQuery(brands, brandQuery),
    [brands, brandQuery],
  );

  const completeTotal = brandsTotal ?? brands.length;

  return (
    <aside className={pending ? 'opacity-60' : ''} aria-busy={pending}>
      <div className="rounded-xl border border-sand-200 bg-white p-5">
        {selectedCategory ? (
          <div className="mb-5">
            <p className="text-sm font-semibold text-ink-900">دسته‌بندی فعال</p>
            <button
              type="button"
              onClick={() => apply({ category: '' })}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sabz-700 px-3 py-1 text-xs font-medium text-white hover:bg-sabz-800"
            >
              {selectedCategory.name}
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : (
          <div className="mb-5">
            <FacetSection title="دسته‌بندی" total={roots.length}>
              {(visibleCount) => (
                <ul role="list" className="mt-3 space-y-2">
                  {roots.slice(0, visibleCount).map((category) => (
                    <li key={category.id}>
                      <button
                        type="button"
                        onClick={() => apply({ category: category.slug })}
                        className="inline-flex min-h-11 items-center rounded-sm py-1 text-start text-sm text-gray-600 hover:text-sabz-700"
                      >
                        {category.name}
                        <span className="ms-1.5 text-xs text-gray-500">
                          {formatFaNumber(category.publishedProductCount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FacetSection>
          </div>
        )}

        <div className="border-t border-sand-200 pt-4">
          <p className="text-sm font-semibold text-ink-900">برند</p>
          <BrandFacetSearch query={brandQuery} onQueryChange={setBrandQuery} />
          {filteredBrands.length === 0 ? (
            <p role="status" className="mt-2 text-xs leading-5 text-gray-500">
              برندی با این نام یافت نشد.{' '}
              <button
                type="button"
                onClick={() => setBrandQuery('')}
                className="font-semibold text-sabz-700 hover:text-sabz-800"
              >
                پاک کردن جستجو
              </button>
            </p>
          ) : (
            <FacetSection
              title=""
              total={filteredBrands.length}
              initialVisible={FACET_DEFAULT_VISIBLE}
            >
              {(visibleCount) => (
                <ul role="list" className="mt-3 space-y-2">
                  {filteredBrands.slice(0, visibleCount).map((brand) => {
                    const selected = state.brand === brand.slug;
                    return (
                      <li key={brand.id}>
                        <button
                          type="button"
                          onClick={() =>
                            apply({ brand: selected ? '' : brand.slug })
                          }
                          aria-pressed={selected}
                          className={`inline-flex min-h-11 items-center gap-2 rounded-sm py-1 text-start text-sm ${
                            selected
                              ? 'font-semibold text-sabz-800'
                              : 'text-gray-600 hover:text-sabz-700'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex size-4 items-center justify-center rounded-sm border text-[10px] leading-none ${
                              selected
                                ? 'border-sabz-700 bg-sabz-700 text-white'
                                : 'border-sand-200 bg-white text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          {brand.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FacetSection>
          )}
          {completeTotal > brands.length ? (
            <p className="mt-2 text-xs text-gray-500">
              نمایش {formatFaNumber(brands.length)} از {formatFaNumber(completeTotal)} برند
            </p>
          ) : null}
        </div>

        <fieldset className="mt-4 border-t border-sand-200 pt-4">
          <legend className="text-sm font-semibold text-ink-900">وضعیت کالا</legend>
          <div className="mt-2 space-y-2">
            {CONDITION_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-gray-600">
                <input
                  type="radio"
                  name="condition"
                  value={value}
                  checked={state.condition === value}
                  onChange={() => apply({ condition: value })}
                  className="size-4 accent-sabz-700"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 border-t border-sand-200 pt-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={state.inStockOnly}
              onChange={(event) => apply({ inStockOnly: event.target.checked })}
              className="size-4 accent-sabz-700"
            />
            فقط موجود
          </label>
        </div>

        <PriceFacet
          key={`${state.priceFrom}|${state.priceTo}`}
          state={state}
          basePath={basePath}
        />
      </div>
    </aside>
  );
}
