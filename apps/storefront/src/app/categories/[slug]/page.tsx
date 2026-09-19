import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CatalogCategoryNode, ProductCondition } from '@sabz/types';
import {
  fetchBrands,
  fetchCategoryTree,
  fetchProducts,
} from '@/lib/catalog';
import { withCategoryPreset } from '@/lib/listing';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { FiltersPanel } from '@/components/ecommerce/filters/filters-panel';
import { SortSelect } from '@/components/ecommerce/filters/sort-select';
import { Pagination } from '@/components/ecommerce/filters/pagination';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}

function findCategory(
  categories: CatalogCategoryNode[],
  slug: string,
): CatalogCategoryNode | null {
  for (const category of categories) {
    if (category.slug === slug) {
      return category;
    }
    const child = findCategory(category.children, slug);
    if (child) {
      return child;
    }
  }
  return null;
}

/** Category landing (SS-126): the shared listing with a preset category. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = await fetchCategoryTree();
  const category = findCategory(categories, slug);
  return { title: category?.name ?? 'دسته‌بندی' };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const categories = await fetchCategoryTree();
  const category = findCategory(categories, slug);
  if (!category) {
    notFound();
  }

  const state = withCategoryPreset(rawSearchParams, slug);
  const [brands, result] = await Promise.all([
    fetchBrands(),
    fetchProducts({
      q: state.q || undefined,
      category: state.category,
      brand: state.brand || undefined,
      condition: (state.condition || undefined) as ProductCondition | undefined,
      sort: state.sort,
      page: state.page,
      limit: 24,
    }),
  ]);

  const makeHref = (page: number) => {
    const search = new URLSearchParams();
    if (state.q) search.set('q', state.q);
    if (state.brand) search.set('brand', state.brand);
    if (state.condition) search.set('condition', state.condition);
    if (state.sort !== 'newest') search.set('sort', state.sort);
    if (page > 1) search.set('page', String(page));
    const qs = search.toString();
    return qs ? `/categories/${slug}?${qs}` : `/categories/${slug}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">دسته‌بندی</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{category.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Intl.NumberFormat('fa-IR').format(result.total)} کالا
          </p>
        </div>
        <SortSelect state={state} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
        <FiltersPanel state={state} categories={categories} brands={brands.items} />

        <section aria-label={`محصولات دسته ${category.name}`}>
          {result.items.length === 0 ? (
            <div className="rounded-xl border border-sand-200 bg-white px-6 py-20 text-center">
              <h2 className="text-lg font-semibold text-ink-900">محصولی یافت نشد</h2>
              <p className="mt-2 text-sm text-gray-500">
                هنوز محصولی در این دسته‌بندی منتشر نشده است.
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
