import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ProductCondition } from '@sabz/types';
import {
  fetchBrands,
  fetchCategoryTree,
  fetchProducts,
} from '@/lib/catalog';
import { withCategoryPreset, buildListingHref } from '@/lib/listing';
import { findCategoryNode, findCategoryPath, findSiblings } from '@/lib/nav';
import { ProductCard } from '@/components/ecommerce/product-card/product-card';
import { ActivePills } from '@/components/ecommerce/filters/active-pills';
import { EmptyState } from '@/components/ecommerce/filters/empty-state';
import { FiltersPanel } from '@/components/ecommerce/filters/filters-panel';
import { PerPageSelect } from '@/components/ecommerce/filters/per-page-select';
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

/**
 * Category landing (SS-126, SS-212): breadcrumb + header + child/sibling nav
 * + listing. Reading `searchParams` keeps rendering dynamic per request
 * while the catalog reads come from the Data Cache (SS-217) — no
 * `force-dynamic`, which would disable caching for the whole route.
 */

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
      priceFrom: state.priceFrom || undefined,
      priceTo: state.priceTo || undefined,
      inStockOnly: state.inStockOnly || undefined,
      sort: state.sort,
      page: state.page,
      limit: state.perPage,
    }),
  ]);

  const basePath = `/categories/${slug}`;
  const makeHref = (page: number) => buildListingHref(basePath, state, { page });

  const brandName = state.brand
    ? brands.items.find((brand) => brand.slug === state.brand)?.name
    : undefined;

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
        <div className="flex flex-wrap items-center gap-2">
          <PerPageSelect state={state} basePath={basePath} />
          <SortSelect state={state} basePath={basePath} />
        </div>
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
          <ActivePills state={state} basePath={basePath} brandName={brandName} />
          {result.items.length === 0 ? (
            <EmptyState state={state} basePath={basePath} />
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
