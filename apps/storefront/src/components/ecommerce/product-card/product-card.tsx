import Image from 'next/image';
import Link from 'next/link';
import type { CatalogProductCardDto } from '@sabz/types';
import { mediaImageUrl } from '@/lib/catalog';
import { conditionLabel, CONDITION_LABELS } from '@/lib/condition';
import { formatCardPrice } from '@/lib/format';

/**
 * Listing card (SS-125), adapted from the ecommerce-v4 product-list markup:
 * thumbnail (SS-129 derivative) with aspect-ratio box, name, brand and the
 * price-from line in Toman. Availability is API-derived (SS-112 semantics).
 */
export function ProductCard({ product }: { product: CatalogProductCardDto }) {
  const image = mediaImageUrl(product.primaryThumbnailUrl ?? product.primaryImageUrl);
  const stockLabel = product.inStock ? 'موجود' : 'ناموجود';

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-sand-200 bg-white transition hover:border-sabz-300 hover:shadow-sm"
    >
      {/* Stock truth for assistive tech: the visual badge (or its absence)
          is never the sole signal. Kept inside the link — no nested buttons. */}
      <span className="sr-only">
        {product.name}، {stockLabel}
      </span>
      <div className="relative aspect-square overflow-hidden bg-sand-100">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 50vw"
            className="object-cover transition group-hover:scale-105"
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
          <span className="absolute top-2 start-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-[11px] font-medium text-white">
            ناموجود
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <p className="text-xs text-gray-500">{product.brand?.name ?? 'بدون برند'}</p>
        <h3 className="mt-1 line-clamp-2 min-h-12 text-[13px] font-semibold leading-6 text-ink-900 group-hover:text-sabz-700 sm:text-sm">
          {product.name}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <p className="min-w-0 text-[13px] font-bold text-sabz-800 sm:text-sm">
            {formatCardPrice(product.priceFrom, product.variantCount, product.callForPrice)}
          </p>
          <span className="shrink-0 rounded-full bg-sand-100 px-2 py-0.5 text-[11px] whitespace-nowrap text-gray-600">
            {conditionLabel(product.condition)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export { CONDITION_LABELS };
