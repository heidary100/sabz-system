import Image from 'next/image';
import Link from 'next/link';
import type { CatalogProductCardDto } from '@sabz/types';
import { mediaImageUrl } from '@/lib/catalog';
import { conditionLabel, CONDITION_LABELS } from '@/lib/condition';
import { formatCardPrice, salePercentFrom } from '@/lib/format';
import { Badge } from '@/components/ecommerce/ui/badge';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';
import { Rating } from '@/components/ecommerce/ui/rating';

/**
 * Listing card (SS-125, rebuilt SS-225): elevated card surface with
 * hover-lift, truthful badges (discount % from the card's compareAtPrice,
 * a generic sale badge when a scheduled Promotion applies without a
 * reference price, and a live countdown to the promotion end — all
 * server-resolved, SS-235 B1), an inquiry chip for call-for-price rows,
 * and no noise — unbranded products omit the brand line entirely instead
 * of printing «بدون برند» (55% of the real catalog). Availability is
 * API-derived (SS-112 semantics).
 */
export function ProductCard({ product }: { product: CatalogProductCardDto }) {
  const image = mediaImageUrl(product.primaryThumbnailUrl ?? product.primaryImageUrl);
  const salePercent = salePercentFrom(product.priceFrom, product.compareAtPrice);
  // Real promotion state (SS-235 B1): a scheduled Promotion row applies even
  // when there is no compare-at reference price — then the badge is generic
  // («فروش ویژه») rather than a percent, and a countdown shows the window.
  const hasPromotion = product.promotionEndsAt !== null;

  return (
    <Link
      href={`/products/${product.slug}`}
      className="hover-lift group flex flex-col overflow-hidden rounded-xl border border-sand-200 bg-white shadow-card hover:border-sabz-300"
    >
      {/* Stock truth for assistive tech: the visual badge (or its absence)
          is never the sole signal. Kept inside the link — no nested buttons.
          The product name is already the card's heading text; repeating it in
          the sr-only span AND the image alt made screen readers read it twice
          (SS-218), so the image is decorative (`alt=""`). */}
      <span className="sr-only">
        {product.name}، {product.inStock ? 'موجود' : 'ناموجود'}
      </span>
      <div className="relative aspect-square overflow-hidden bg-sand-100">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            // Grid is 2 columns below xl (50vw) and 4 columns at xl+
            // (~20vw inside the max-w-7xl container). The previous
            // 768px+ 25vw hint undersized tablet images.
            sizes="(min-width: 1280px) 20vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sabz-300">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-10">
              <path
                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0 0 21.75 19.5V4.5A1.5 1.5 0 0 0 20.25 3H3.75A1.5 1.5 0 0 0 2.25 4.5v15A1.5 1.5 0 0 0 3.75 21Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
        {!product.inStock ? (
          <Badge variant="outOfStock" className="absolute top-2 start-2">
            اتمام موجودی
          </Badge>
        ) : null}
        {salePercent !== null ? (
          <Badge variant="sale" className="absolute top-2 end-2">
            تخفیف {salePercent.toLocaleString('fa-IR', { useGrouping: false })}٪
          </Badge>
        ) : hasPromotion && product.inStock ? (
          <Badge variant="sale" className="absolute top-2 end-2">
            فروش ویژه
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        {product.brand ? (
          <p className="text-[11px] font-medium text-gray-400">{product.brand.name}</p>
        ) : null}
        <h3 className="mt-1.5 line-clamp-2 min-h-12 text-[13px] font-semibold leading-6 text-ink-900 transition-colors duration-200 group-hover:text-sabz-700 sm:text-sm">
          {product.name}
        </h3>
        {/* SS-236: real aggregate stars; hidden until the first approval. */}
        {product.ratingCount > 0 && product.ratingAverage !== null ? (
          <div className="mt-1.5">
            <Rating value={product.ratingAverage} count={product.ratingCount} />
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          {product.callForPrice ? (
            <Badge variant="callForPrice">استعلام قیمت</Badge>
          ) : (
            <p className="min-w-0 text-sm font-extrabold text-sabz-800 sm:text-[15px]">
              {formatCardPrice(product.priceFrom, product.variantCount, product.callForPrice)}
            </p>
          )}
          <Badge variant="condition">{conditionLabel(product.condition)}</Badge>
        </div>
        {product.promotionEndsAt !== null && !product.callForPrice ? (
          <div className="px-3 pt-2 sm:px-4">
            <CountdownTimer endsAt={product.promotionEndsAt} size="sm" />
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export { CONDITION_LABELS };
