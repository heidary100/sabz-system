'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import type { CatalogBrandDto, CatalogCategoryNode } from '@sabz/types';
import { buildListingQuery, type ListingState } from '@/lib/listing';

/**
 * Listing filter controls (SS-125): URL search params are the single source
 * of truth — every change pushes a new query string and resets the page.
 */
export function FiltersPanel({
  state,
  categories,
  brands,
}: {
  state: ListingState;
  categories: CatalogCategoryNode[];
  brands: CatalogBrandDto[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(changes: Partial<ListingState>) {
    startTransition(() => {
      const query = buildListingQuery(state, changes);
      router.push(query ? `/products?${query}` : '/products');
    });
  }

  const selectedCategory = findCategory(categories, state.category);

  return (
    <aside className={pending ? 'opacity-60' : ''} aria-busy={pending}>
      <div className="rounded-xl border border-sand-200 bg-white p-5">
        {selectedCategory ? (
          <div className="mb-5">
            <p className="text-sm font-semibold text-ink-900">دسته‌بندی فعال</p>
            <button
              type="button"
              onClick={() => apply({ category: '' })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sabz-700 px-3 py-1 text-xs font-medium text-white hover:bg-sabz-800"
            >
              {selectedCategory.name}
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : (
          <div className="mb-5">
            <p className="text-sm font-semibold text-ink-900">دسته‌بندی</p>
            <ul role="list" className="mt-3 space-y-2">
              {categories.slice(0, 8).map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => apply({ category: category.slug })}
                    className="text-sm text-gray-600 hover:text-sabz-700"
                  >
                    {category.name}
                    <span className="ms-1.5 text-xs text-gray-400">
                      {new Intl.NumberFormat('fa-IR').format(category.publishedProductCount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-sand-200 pt-4">
          <label htmlFor="brand-filter" className="text-sm font-semibold text-ink-900">
            برند
          </label>
          <select
            id="brand-filter"
            value={state.brand}
            onChange={(event) => apply({ brand: event.target.value })}
            className="mt-2 w-full rounded-md border-0 bg-sand-100 py-2 pe-8 ps-3 text-sm ring-1 ring-inset ring-sand-200 focus:ring-2 focus:ring-sabz-600"
          >
            <option value="">همه برندها</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.slug}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="mt-4 border-t border-sand-200 pt-4">
          <legend className="text-sm font-semibold text-ink-900">وضعیت کالا</legend>
          <div className="mt-2 space-y-2">
            {[
              ['', 'همه'],
              ['NEW', 'نو'],
              ['OPEN_BOX', 'جعبه‌باز'],
              ['REFURBISHED', 'بازسازی‌شده'],
              ['USED', 'کارکرده'],
              ['STOCK_CLEARANCE', 'کلیرنس'],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-gray-600">
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
      </div>
    </aside>
  );
}

function findCategory(
  categories: { name: string; slug: string; children: unknown[] }[],
  slug: string,
): { name: string } | null {
  for (const category of categories) {
    if (category.slug === slug) {
      return category;
    }
    const child = findCategory(category.children as Parameters<typeof findCategory>[0], slug);
    if (child) {
      return child;
    }
  }
  return null;
}
