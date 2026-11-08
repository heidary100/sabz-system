import Link from 'next/link';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { CategoryCover } from '@/components/ecommerce/header/category-cover';
import { SectionHeader } from '@/components/ecommerce/ui/section-header';

/**
 * Visual category discovery (Task 04). One asymmetric editorial grid:
 * the first category is a large 2×2 tile at desktop; the remaining five fill
 * the right column and the bottom row. Mobile keeps six equal two-column
 * tiles. Covers are derived product images from one bounded API request.
 */
export function CategoryDiscovery({
  categories,
  covers,
}: {
  categories: CatalogCategoryNode[];
  covers: Record<string, string | null>;
}) {
  const visible = categories.filter(
    (category) => category.publishedProductCount > 0,
  );
  if (visible.length === 0) {
    return null;
  }
  const [feature, ...supporting] = visible;

  return (
    <section
      data-home-section="categories"
      aria-labelledby="categories-heading"
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <SectionHeader
        id="categories-heading"
        title="دسته‌بندی‌ها"
        subtitle="از میان دسته‌های اصلی فروشگاه"
        actionHref="/categories"
      />
      <ul
        role="list"
        className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:auto-rows-[10.5rem]"
      >
        {feature ? (
          <li className="col-span-1 lg:col-span-2 lg:row-span-2">
            <CategoryDiscoveryTile
              category={feature}
              cover={covers[feature.slug] ?? null}
              featured
            />
          </li>
        ) : null}
        {supporting.map((category) => (
          <li key={category.id} className="min-h-40">
            <CategoryDiscoveryTile
              category={category}
              cover={covers[category.slug] ?? null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryDiscoveryTile({
  category,
  cover,
  featured = false,
}: {
  category: CatalogCategoryNode;
  cover: string | null;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex h-full min-h-40 flex-col overflow-hidden rounded-panel border border-border bg-plate transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <div className="relative min-h-32 flex-1 overflow-hidden">
        <CategoryCover src={cover} name={category.name} variant="panel" />
      </div>
      <div
        className={`relative flex items-center justify-between gap-3 bg-stage px-4 py-3 text-on-stage ${
          featured ? 'lg:px-5 lg:py-4' : ''
        }`}
      >
        <span className="min-w-0">
          <span
            className={`block line-clamp-2 leading-5 font-bold ${
              featured ? 'text-base lg:text-lg' : 'text-sm'
            }`}
          >
            {category.name}
          </span>
          <span className="mt-0.5 block text-[11px] text-on-stage-muted">
            {formatFaNumber(category.publishedProductCount)} کالا
          </span>
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="size-4 shrink-0 text-accent-stage transition-transform duration-200 group-hover:-translate-x-0.5"
        >
          <path
            fillRule="evenodd"
            d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </Link>
  );
}
