import type { CatalogProductDetailDto } from '@sabz/types';
import { buildProductJsonLd } from '@/lib/product-seo';

/**
 * Machine-readable product metadata (SS-214, server). Emits one
 * schema.org `Product` object via `JSON.stringify` only — never raw HTML.
 * Pricing mirrors the DTO truthfully: no offer for CALL_FOR_PRICE-only
 * products, one Offer for a single priced variant, AggregateOffer otherwise.
 */
export function ProductJsonLd({
  product,
  canonicalUrl,
  imageUrls,
}: {
  product: CatalogProductDetailDto;
  canonicalUrl: string;
  imageUrls: string[];
}) {
  const jsonLd = buildProductJsonLd({ product, canonicalUrl, imageUrls });
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
