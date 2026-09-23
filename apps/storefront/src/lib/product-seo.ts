import type {
  CatalogProductDetailDto,
  CatalogProductMediaDto,
  CatalogProductVariantDto,
} from '@sabz/types';
import { seoDescriptionFromHtml } from './seo';

/**
 * Product SEO builders (SS-214).
 *
 * Pure helpers behind OG metadata and JSON-LD: image priority, offer shaping
 * with truthful pricing (never a fake offer for CALL_FOR_PRICE), and
 * HTML-free descriptions. Components stay thin; logic is unit-tested.
 */

/**
 * OG-image candidate: the primary IMAGE, else the first IMAGE. Video URLs
 * are never images — null when the product has no image media so callers
 * omit the tag instead of fabricating a placeholder.
 */
export function selectOgImage(
  media: CatalogProductMediaDto[],
): CatalogProductMediaDto | null {
  const images = media.filter((item) => item.mediaType === 'IMAGE');
  return images.find((item) => item.isPrimary) ?? images[0] ?? null;
}

export interface ProductJsonLdInput {
  product: CatalogProductDetailDto;
  /** Absolute canonical URL (`/products/<slug>`, never with `?variant=`). */
  canonicalUrl: string;
  /** Absolute image URLs (already resolved); empty when none exist. */
  imageUrls: string[];
}

function offerOf(
  variant: CatalogProductVariantDto,
  canonicalUrl: string,
): Record<string, unknown> {
  return {
    '@type': 'Offer',
    priceCurrency: 'IRT',
    price: variant.price,
    availability: variant.inStock
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    sku: variant.sku,
    url: canonicalUrl,
  };
}

/**
 * Builds a schema.org Product object or null when the product has no usable
 * identity. CALL_FOR_PRICE variants never produce offers; a single PRICED
 * variant yields one Offer; several yield an AggregateOffer over PRICED
 * variants only. Availability mirrors the detail DTO.
 */
export function buildProductJsonLd({
  product,
  canonicalUrl,
  imageUrls,
}: ProductJsonLdInput): Record<string, unknown> {
  const description =
    product.metaDescription ??
    product.shortDescription ??
    seoDescriptionFromHtml(product.description, 500);

  const priced = product.variants.filter(
    (variant) => variant.priceStatus === 'PRICED',
  );

  let offers: Record<string, unknown> | undefined;
  if (priced.length === 1) {
    offers = offerOf(priced[0]!, canonicalUrl);
  } else if (priced.length > 1) {
    const prices = priced.map((variant) => Number(variant.price));
    offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'IRT',
      offerCount: priced.length,
      lowPrice: String(Math.min(...prices)),
      highPrice: String(Math.max(...prices)),
      offers: priced.map((variant) => offerOf(variant, canonicalUrl)),
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: canonicalUrl,
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    ...(description ? { description } : {}),
    ...(product.variants.length > 0 ? { sku: product.variants[0]!.sku } : {}),
    ...(product.brand
      ? { brand: { '@type': 'Brand', name: product.brand.name } }
      : {}),
    ...(offers ? { offers } : {}),
  };
}
