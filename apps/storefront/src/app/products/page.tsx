import type { Metadata } from 'next';
import type { ProductCondition } from '@sabz/types';
import { fetchBrands, fetchCategoryTree, fetchProducts } from '@/lib/catalog';
import { buildListingHref, isFiltering, parseListingState } from '@/lib/listing';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { ActivePills } from '@/components/ecommerce/filters/active-pills';
import { EmptyState } from '@/components/ecommerce/filters/empty-state';
import { FiltersPanel } from '@/components/ecommerce/filters/filters-panel';
import { PerPageSelect } from '@/components/ecommerce/filters/per-page-select';
import { ResultStatus } from '@/components/ecommerce/filters/result-status';
import { SortSelect } from '@/components/ecommerce/filters/sort-select';
import { Pagination } from '@/components/ecommerce/filters/pagination';

export const metadata: Metadata = { title: 'محصولات' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Product listing (SS-125): URL searchParams are the single source of truth;
 * the page is a server component over the public catalog API. Reading
 * `searchParams` makes rendering dynamic per request while the catalog reads
 * themselves come from the Data Cache (SS-217) — no `force-dynamic`, which
 * would disable caching for the whole route.
 */

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const state = parseListingState(params);

  const [categories, brands, result] = await Promise.all([
    fetchCategoryTree(),
    fetchBrands(),
    fetchProducts({
      q: state.q || undefined,
      category: state.category || undefined,
      brand: state.brand || undefined,
      condition: (state.condition || undefined) as ProductCondition | undefined,
      priceFrom: state.priceFrom || undefined,
      priceTo: state.priceTo || undefined,
      inStockOnly: state.inStockOnly || undefined,
      sort: state.sort,
      page: state.page,
      limit: state.perPage,
    }),
  ]);

  const makeHref = (page: number) => buildListingHref('/products', state, { page });

  const filtering = isFiltering(state);
  const brandName = state.brand
    ? brands.items.find((brand) => brand.slug === state.brand)?.name
    : undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            {state.q ? `نتایج جستجو برای «${state.q}»` : 'همه محصولات'}
          </h1>
          <ResultStatus
            total={result.total}
            filtering={filtering}
            query={state.q || undefined}
            className="mt-1 text-sm text-gray-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PerPageSelect state={state} basePath="/products" />
          <SortSelect state={state} basePath="/products" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
        <FiltersPanel
          state={state}
          categories={categories}
          brands={brands.items}
          brandsTotal={brands.total}
          basePath="/products"
        />

        <section aria-label="فهرست محصولات">
          <ActivePills state={state} basePath="/products" brandName={brandName} />
          {result.items.length === 0 ? (
            <EmptyState
              state={state}
              basePath="/products"
              emptyCategoryMessage="هنوز محصولی منتشر نشده است."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                {result.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              <Pagination result={result} makeHref={makeHref} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

