import Link from 'next/link';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { CategoryCover } from '@/components/ecommerce/header/category-cover';

/**
 * Editorial split campaign (Task 04): the real stock-goods category, its
 * real subtree count and (when available) the real stock-laptop count. No
 * warranty, grading, refurbishment or condition claim is made.
 */
export function SplitCampaign({
  category,
  cover,
  laptopCount,
}: {
  category: CatalogCategoryNode | null;
  cover: string | null;
  laptopCount: number | null;
}) {
  if (!category) {
    return null;
  }

  return (
    <section
      data-home-section="stock"
      aria-labelledby="stock-heading"
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <div className="grid overflow-hidden rounded-panel border border-border lg:grid-cols-2">
        <div className="relative min-h-64 bg-plate p-4 sm:p-6">
          <CategoryCover
            src={cover}
            name={category.name}
            variant="panel"
          />
        </div>
        <div className="stage-surface flex flex-col justify-center bg-stage p-6 text-on-stage sm:p-10">
          <p className="text-[11px] font-semibold text-accent-stage">
            دسته‌بندی ویژه
          </p>
          <h2
            id="stock-heading"
            className="mt-3 text-balance text-2xl font-black leading-9 sm:text-3xl"
          >
            {category.name}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-on-stage-secondary">
            لپ‌تاپ، کامپیوتر و لوازم استوک؛ شمارش کالاها بر اساس کاتالوگ
            منتشرشده فروشگاه.
          </p>

          <dl className="mt-6 flex flex-wrap gap-2">
            <div className="rounded-control border border-on-stage/15 bg-on-stage/5 px-3 py-2">
              <dt className="text-[10px] text-on-stage-muted">کل کالاها</dt>
              <dd className="mt-0.5 text-sm font-bold text-on-stage">
                {formatFaNumber(category.publishedProductCount)}
              </dd>
            </div>
            {laptopCount !== null && laptopCount > 0 ? (
              <div className="rounded-control border border-on-stage/15 bg-on-stage/5 px-3 py-2">
                <dt className="text-[10px] text-on-stage-muted">لپ‌تاپ</dt>
                <dd className="mt-0.5 text-sm font-bold text-on-stage">
                  {formatFaNumber(laptopCount)}
                </dd>
              </div>
            ) : null}
          </dl>

          <Link
            href={`/categories/${category.slug}`}
            className="mt-7 inline-flex min-h-11 w-fit items-center justify-center rounded-control bg-on-stage px-5 text-sm font-bold text-stage transition-colors hover:bg-on-stage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            مشاهده {category.name}
          </Link>
        </div>
      </div>
    </section>
  );
}
