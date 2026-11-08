'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { CatalogBrandDto, CatalogCategoryNode } from '@sabz/types';
import { buildListingHref, RATING_BUCKETS, type ListingState } from '@/lib/listing';
import { CONDITION_OPTIONS } from '@/lib/condition';
import { formatFaNumber } from '@/lib/format';
import { FACET_DEFAULT_VISIBLE, findCategoryNode, navRoots } from '@/lib/nav';
import { Rating } from '@/components/ecommerce/ui/rating';
import { FacetSection } from './facet-section';
import { BrandFacetSearch, filterBrandsByQuery } from './brand-facet-search';
import { PriceFacet } from './price-facet';

/** Category routes own the category in the pathname — drilling is a path nav. */
function isCategoryBasePath(basePath: string): boolean {
  return basePath === '/categories' || basePath.startsWith('/categories/');
}

/**
 * One category facet row (SS-226): label + published count. On category
 * routes it navigates to the child's path; on /products it updates the
 * `category` query param through the canonical href builder.
 */
function CategoryFacetLink({
  label,
  count,
  href,
  onClick,
}: {
  label: string;
  count: number;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      {label}
      <span className="ms-1.5 text-xs text-fg-muted">{formatFaNumber(count)}</span>
    </>
  );
  const className =
    'inline-flex min-h-11 w-full items-center rounded-control py-1 text-start text-sm text-fg-secondary transition-all duration-200 hover:ps-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
  if (href) {
    return (
      <Link href={href} className={className} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

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
  priceFormId,
  onPriceApplied,
}: {
  state: ListingState;
  categories: CatalogCategoryNode[];
  brands: CatalogBrandDto[];
  /** Total brand count from the API (may exceed the loaded page). */
  brandsTotal?: number;
  basePath?: string;
  /** Sheet-only: id for the price form so the footer button can submit it. */
  priceFormId?: string;
  /** Sheet-only: fires after a valid price commit so the sheet can close. */
  onPriceApplied?: () => void;
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
    <aside className={`transition-opacity duration-300 ${pending ? 'opacity-60' : ''}`} aria-busy={pending}>
      <div className="rounded-card border border-border bg-surface p-5">
        {selectedCategory ? (
          <div className="mb-5">
            <p className="text-sm font-semibold text-fg">دسته‌بندی فعال</p>
            <button
              type="button"
              onClick={() => apply({ category: '' })}
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover"
            >
              {selectedCategory.name}
              <span aria-hidden="true">×</span>
            </button>
            {/* SS-226: drill deeper — children of the active category, right
                in the facet. On category routes a child is a path navigation
                (the pathname owns the category); on /products it swaps the
                deep-linked category param. */}
            {selectedCategory.children.length > 0 ? (
              <ul role="list" className="mt-3 space-y-2">
                {selectedCategory.children.map((child) => (
                  <li key={child.id}>
                    <CategoryFacetLink
                      label={child.name}
                      count={child.publishedProductCount}
                      href={
                        isCategoryBasePath(basePath)
                          ? `/categories/${child.slug}`
                          : undefined
                      }
                      onClick={
                        isCategoryBasePath(basePath)
                          ? undefined
                          : () => apply({ category: child.slug })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="mb-5">
            <FacetSection title="دسته‌بندی" total={roots.length}>
              {(visibleCount) => (
                <ul role="list" className="mt-3 space-y-2">
                  {roots.slice(0, visibleCount).map((category) => (
                    <li key={category.id}>
                      <CategoryFacetLink
                        label={category.name}
                        count={category.publishedProductCount}
                        href={
                          isCategoryBasePath(basePath)
                            ? `/categories/${category.slug}`
                            : undefined
                        }
                        onClick={
                          isCategoryBasePath(basePath)
                            ? undefined
                            : () => apply({ category: category.slug })
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </FacetSection>
          </div>
        )}

        <div className="border-t border-border pt-4">
          <p className="text-sm font-semibold text-fg">برند</p>
          <BrandFacetSearch query={brandQuery} onQueryChange={setBrandQuery} />
          {filteredBrands.length === 0 ? (
            <p role="status" className="mt-2 text-xs leading-5 text-fg-muted">
              برندی با این نام یافت نشد.{' '}
              <button
                type="button"
                onClick={() => setBrandQuery('')}
                className="font-semibold text-accent hover:text-accent-hover"
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
                          className={`inline-flex min-h-11 w-full items-center gap-2 rounded-control py-1 text-start text-sm transition-all duration-200 hover:ps-1 ${
                            selected
                              ? 'font-semibold text-accent-hover'
                              : 'text-fg-secondary hover:text-accent'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`flex size-4 items-center justify-center rounded-control border text-[10px] leading-none ${
                              selected
                                ? 'border-accent bg-accent text-on-accent'
                                : 'border-border-control bg-surface text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          {brand.name}
                          {/* SS-226: facet count from the API. */}
                          {typeof brand.productCount === 'number' ? (
                            <span className="text-xs text-fg-muted">
                              {formatFaNumber(brand.productCount)}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </FacetSection>
          )}
          {completeTotal > brands.length ? (
            <p className="mt-2 text-xs text-fg-muted">
              نمایش {formatFaNumber(brands.length)} از {formatFaNumber(completeTotal)} برند
            </p>
          ) : null}
        </div>

        <fieldset className="mt-4 border-t border-border pt-4">
          <legend className="text-sm font-semibold text-fg">وضعیت کالا</legend>
          <div className="mt-2 space-y-2">
            {CONDITION_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-fg-secondary">
                <input
                  type="radio"
                  name="condition"
                  value={value}
                  checked={state.condition === value}
                  onChange={() => apply({ condition: value })}
                  className="size-4 accent-accent"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 border-t border-border pt-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg-secondary">
            <input
              type="checkbox"
              checked={state.inStockOnly}
              onChange={(event) => apply({ inStockOnly: event.target.checked })}
              className="size-4 accent-accent"
            />
            فقط موجود
          </label>
        </div>

        <fieldset className="mt-4 border-t border-border pt-4">
          <legend className="text-sm font-semibold text-fg">امتیاز کاربران</legend>
          <div className="mt-2 space-y-2">
            {RATING_BUCKETS.map((bucket) => (
              <label key={bucket} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg-secondary">
                <input
                  type="radio"
                  name="rating"
                  value={bucket}
                  checked={state.rating === bucket}
                  onChange={() => apply({ rating: bucket })}
                  className="size-4 accent-accent"
                />
                <Rating value={Number(bucket)} />
              </label>
            ))}
          </div>
        </fieldset>

        <PriceFacet
          key={`${state.priceFrom}|${state.priceTo}`}
          state={state}
          basePath={basePath}
          formId={priceFormId}
          onApplied={onPriceApplied}
        />
      </div>
    </aside>
  );
}
