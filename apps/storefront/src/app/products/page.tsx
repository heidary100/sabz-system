import type { Metadata } from 'next';
import type { ProductCondition } from '@sabz/types';
import { fetchBrands, fetchCategoryTree, fetchProducts } from '@/lib/catalog';
import { parseListingState } from '@/lib/listing';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { FiltersPanel } from '@/components/ecommerce/filters/filters-panel';
import { SortSelect } from '@/components/ecommerce/filters/sort-select';
import { Pagination } from '@/components/ecommerce/filters/pagination';

export const metadata: Metadata = { title: 'محصولات' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Product listing (SS-125): URL search params are the single source of truth;
 * the page is a server component over the public catalog API.
 */
// Catalog pages render per request: build-time prerendering would either
// snapshot stale data or fail when the API is unreachable (CI).
export const dynamic = 'force-dynamic';

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
      sort: state.sort,
      page: state.page,
      limit: 24,
    }),
  ]);

  const makeHref = (page: number) => {
    const query = buildQuery(state, page);
    return query ? `/products?${query}` : '/products';
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">
            {state.q ? `نتایج جستجو: ${state.q}` : 'همه محصولات'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Intl.NumberFormat('fa-IR').format(result.total)} کالا
          </p>
        </div>
        <SortSelect state={state} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
        <FiltersPanel state={state} categories={categories} brands={brands.items} />

        <section aria-label="فهرست محصولات">
          {result.items.length === 0 ? (
            <div className="rounded-xl border border-sand-200 bg-white px-6 py-20 text-center">
              <h2 className="text-lg font-semibold text-ink-900">محصولی یافت نشد</h2>
              <p className="mt-2 text-sm text-gray-500">
                با این فیلترها محصولی پیدا نشد. فیلترها را تغییر دهید یا جستجوی
                دیگری را امتحان کنید.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

function buildQuery(
  state: ReturnType<typeof parseListingState>,
  page: number,
): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.brand) params.set('brand', state.brand);
  if (state.condition) params.set('condition', state.condition);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (page > 1) params.set('page', String(page));
  return params.toString();
}
