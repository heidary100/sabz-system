import Link from 'next/link'
import type { PublishedCategorySpotlightSection } from '@sabz/types'
import { CategoryCover } from '@/components/ecommerce/header/category-cover'
import { formatFaNumber } from '@/lib/format'
import { safeInternalHref, safeMediaImageUrl } from '@/lib/homepage-view'

/**
 * Published category spotlight.
 *
 * The editorial copy, category, counts and destination all come from the
 * resolved public homepage payload. Unlike the old stock-goods split
 * campaign, this renderer contains no hardcoded category or campaign copy.
 */
export function CategorySpotlight({
  section,
}: {
  section: PublishedCategorySpotlightSection
}) {
  const { category, copy, secondaryCount } = section
  const heading = copy.titleFa ?? category.name
  const cover = safeMediaImageUrl(category.coverUrl)
  const copyHref = safeInternalHref(copy.href)
  // A category spotlight's primary action belongs to its own category. Scope
  // a generic all-products campaign CTA to the spotlighted category.
  const href =
    copyHref === '/products' ? `/categories/${category.slug}` : copyHref

  return (
    <section
      data-home-section="spotlight"
      aria-labelledby={`spotlight-heading-${section.key}`}
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
    >
      <div className="grid overflow-hidden rounded-panel border border-border lg:grid-cols-2">
        <div className="relative min-h-64 bg-plate p-4 sm:p-6">
          <CategoryCover src={cover} name={category.name} variant="panel" />
        </div>
        <div className="stage-surface flex flex-col justify-center bg-stage p-6 text-on-stage sm:p-10">
          {copy.eyebrowFa ? (
            <p className="text-[11px] font-semibold text-accent-stage">
              {copy.eyebrowFa}
            </p>
          ) : null}
          <h2
            id={`spotlight-heading-${section.key}`}
            className="mt-3 text-balance text-2xl font-black leading-9 sm:text-3xl"
          >
            {heading}
          </h2>
          {copy.subtitleFa ? (
            <p className="mt-3 max-w-md text-sm leading-7 text-on-stage-secondary">
              {copy.subtitleFa}
            </p>
          ) : null}

          <dl className="mt-6 flex flex-wrap gap-2">
            <div className="rounded-control border border-on-stage/15 bg-on-stage/5 px-3 py-2">
              <dt className="text-[10px] text-on-stage-muted">کل کالاها</dt>
              <dd className="mt-0.5 text-sm font-bold text-on-stage">
                {formatFaNumber(category.publishedProductCount)}
              </dd>
            </div>
            {secondaryCount !== null ? (
              <div className="rounded-control border border-on-stage/15 bg-on-stage/5 px-3 py-2">
                <dt className="text-[10px] text-on-stage-muted">دسته دوم</dt>
                <dd className="mt-0.5 text-sm font-bold text-on-stage">
                  {formatFaNumber(secondaryCount)}
                </dd>
              </div>
            ) : null}
          </dl>

          {href && copy.ctaLabelFa ? (
            <Link
              href={href}
              className="mt-7 inline-flex min-h-12 w-fit items-center justify-center rounded-pill bg-on-stage px-7 text-sm font-bold text-stage transition-colors hover:bg-on-stage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98]"
            >
              {copy.ctaLabelFa}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}
