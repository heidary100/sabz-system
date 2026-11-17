import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CatalogProductCardDto } from '@sabz/types';
import { mediaImageUrl } from '@/lib/catalog';
import { conditionLabel, CONDITION_LABELS } from '@/lib/condition';
import { formatCardPrice, formatToman, salePercentFrom } from '@/lib/format';
import { Badge } from '@/components/ecommerce/ui/badge';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';
import { Rating } from '@/components/ecommerce/ui/rating';
import { ProductCardImage } from './product-card-image';

export type ProductCardDensity = 'default' | 'compact';

/**
 * Catalogue product card (Task 02). One material, one structure, two
 * deliberate densities.
 *
 * Semantics: the image/information/price block is a single anchor; all
 * interactive commerce controls arrive through the `footer` and `corner`
 * slots as siblings, so no button is ever nested inside the product link.
 * The price owns its own block and can never be covered by an action.
 */
export function ProductCard({
  product,
  density = 'default',
  footer,
  corner,
}: {
  product: CatalogProductCardDto;
  density?: ProductCardDensity;
  /** Action row rendered outside the product anchor. */
  footer?: ReactNode;
  /** Absolute media-companion control (e.g. wishlist heart). */
  corner?: ReactNode;
}) {
  const compact = density === 'compact';
  const image = mediaImageUrl(
    product.primaryThumbnailUrl ?? product.primaryImageUrl,
  );
  const salePercent = salePercentFrom(
    product.priceFrom,
    product.compareAtPrice,
  );
  const hasPromotion = product.promotionEndsAt !== null;
  const showCondition = product.condition !== 'NEW';
  const availabilityLabel = product.inStock ? 'موجود' : 'ناموجود';
  const price = formatCardPrice(
    product.priceFrom,
    product.variantCount,
    product.callForPrice,
  );

  return (
    <div
      data-density={density}
      className="group/card relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface transition-colors duration-200 hover:border-accent/60 focus-within:border-accent/60"
    >
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div
          data-card-image
          className="relative aspect-square overflow-hidden bg-plate"
        >
          <div
            className={`absolute inset-0 ${compact ? 'p-2.5' : 'p-3 sm:p-4'}`}
          >
            <ProductCardImage
              src={image}
              sizes="(min-width: 1280px) 22vw, (min-width: 640px) 33vw, 50vw"
              className="object-contain transition-transform duration-200 ease-[var(--ease-out)] group-hover/card:scale-[1.02] motion-reduce:group-hover/card:scale-100"
            />
          </div>

          {salePercent !== null ? (
            <Badge variant="sale" className="absolute start-2 top-2 z-10">
              تخفیف{' '}
              {salePercent.toLocaleString('fa-IR', { useGrouping: false })}٪
            </Badge>
          ) : hasPromotion && product.inStock ? (
            <Badge variant="sale" className="absolute start-2 top-2 z-10">
              فروش ویژه
            </Badge>
          ) : null}
        </div>

        <div
          data-card-info
          className={`flex flex-1 flex-col ${compact ? 'p-3' : 'p-3.5 sm:p-4'}`}
        >
          <div className="min-h-4">
            {product.brand ? (
              <p
                dir="auto"
                translate="no"
                className="truncate text-[11px] font-medium text-fg-muted"
              >
                {product.brand.name}
              </p>
            ) : null}
          </div>

          <h3
            dir="auto"
            className={`mt-1 line-clamp-2 font-semibold text-fg transition-colors duration-200 group-hover/card:text-accent ${
              compact
                ? 'min-h-10 text-[12.5px] leading-5'
                : 'min-h-12 text-[13px] leading-6 sm:text-sm'
            }`}
          >
            {product.name}
          </h3>

          {product.ratingCount > 0 && product.ratingAverage !== null && !compact ? (
            <div className="mt-1.5">
              <Rating
                value={product.ratingAverage}
                count={product.ratingCount}
              />
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span
              className={`inline-flex items-center gap-1 font-medium ${
                product.inStock ? 'text-success' : 'text-fg-muted'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-pill ${
                  product.inStock ? 'bg-success' : 'bg-fg-muted'
                }`}
              />
              {availabilityLabel}
            </span>
            {product.variantCount > 1 && !compact ? (
              <span className="text-fg-muted">
                {product.variantCount.toLocaleString('fa-IR')} گزینه
              </span>
            ) : null}
            {showCondition ? (
              <Badge variant="condition">{conditionLabel(product.condition)}</Badge>
            ) : null}
          </div>

          <div data-card-price className="mt-auto pb-1 pt-3">
            {product.callForPrice ? (
              <p
                className={`font-extrabold ${
                  footer
                    ? 'text-[11px] font-medium text-fg-muted'
                    : 'text-sm text-accent'
                }`}
              >
                {footer ? 'قیمت پس از استعلام' : 'استعلام قیمت'}
              </p>
            ) : (
              <p
                className={`font-extrabold leading-5 text-accent-hover [font-variant-numeric:tabular-nums] ${
                  compact ? 'text-[13px]' : 'text-sm sm:text-[15px]'
                }`}
              >
                {price}
              </p>
            )}
            {product.compareAtPrice && salePercent !== null ? (
              <s className="mt-1 block text-[11px] font-normal leading-5 text-fg-muted decoration-1 [font-variant-numeric:tabular-nums]">
                <span className="sr-only">قیمت پیشین </span>
                {formatToman(product.compareAtPrice)}
              </s>
            ) : null}
            {product.promotionEndsAt !== null && !product.callForPrice ? (
              <div className="mt-1.5">
                <CountdownTimer endsAt={product.promotionEndsAt} size="sm" />
              </div>
            ) : null}
          </div>
        </div>
      </Link>

      {corner ? (
        <div className="absolute end-2 top-2 z-10">{corner}</div>
      ) : null}

      {footer ? (
        <div
          data-card-actions
          className={`border-t border-border bg-surface ${
            compact ? 'p-2.5' : 'p-3'
          }`}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export { CONDITION_LABELS };
