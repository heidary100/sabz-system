import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ProductCondition } from '@sabz/types';
import {
  fetchBrands,
  fetchCategoryTree,
  fetchProducts,
} from '@/lib/catalog';
import { withCategoryPreset } from '@/lib/listing';
import { findCategoryNode, findCategoryPath, findSiblings } from '@/lib/nav';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { FiltersPanel } from '@/components/ecommerce/filters/filters-panel';
import { SortSelect } from '@/components/ecommerce/filters/sort-select';
import { Pagination } from '@/components/ecommerce/filters/pagination';
import { CategoryBreadcrumb } from '@/components/ecommerce/category/category-breadcrumb';
import { CategoryHeader } from '@/components/ecommerce/category/category-header';
import { CategoryDescription } from '@/components/ecommerce/category/category-description';
import { CategoryChildGrid } from '@/components/ecommerce/category/category-child-grid';
import { CategorySiblingNav } from '@/components/ecommerce/category/category-sibling-nav';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}

/** Category landing (SS-126, SS-212): breadcrumb + header + child/sibling nav + listing. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = await fetchCategoryTree();
  const category = findCategoryNode(categories, slug);
  return { title: category?.name ?? 'دسته‌بندی' };
}

// Catalog pages render per request: build-time prerendering would either
// snapshot stale data or fail when the API is unreachable (CI).
export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const categories = await fetchCategoryTree();
  const category = findCategoryNode(categories, slug);
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

  const basePath = `/categories/${slug}`;
  const makeHref = (page: number) => {
    const search = new URLSearchParams();
    if (state.q) search.set('q', state.q);
    if (state.brand) search.set('brand', state.brand);
    if (state.condition) search.set('condition', state.condition);
    if (state.sort !== 'newest') search.set('sort', state.sort);
    if (page > 1) search.set('page', String(page));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const trail = findCategoryPath(categories, slug);
  const { siblings } = findSiblings(categories, slug);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <CategoryBreadcrumb trail={trail} />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <CategoryHeader
          name={category.name}
          rollUpCount={category.publishedProductCount}
          filteredTotal={result.total}
        />
        <SortSelect state={state} basePath={basePath} />
      </div>

      <CategoryDescription html={null} />

      {category.children.length > 0 ? (
        <div className="mt-8">
          <CategoryChildGrid items={category.children} />
        </div>
      ) : null}

      {siblings.length > 1 ? (
        <div className="mt-6">
          <CategorySiblingNav siblings={siblings} currentSlug={slug} />
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
        <FiltersPanel
          state={state}
          categories={categories}
          brands={brands.items}
          brandsTotal={brands.total}
          basePath={basePath}
        />

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
