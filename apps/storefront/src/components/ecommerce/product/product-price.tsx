import type { CatalogProductVariantDto } from '@sabz/types';
import { CALL_FOR_PRICE_LABEL, formatToman } from '@/lib/format';

/**
 * Selected-variant price (SS-214). Single source for detail-page pricing:
 * CALL_FOR_PRICE shows the contact label with no numeric price; PRICED shows
 * the Toman price with an optional compare-at reference. Never an «از»
 * prefix — the detail page represents exactly one selected variant, so
 * `formatCardPrice()` (listing-only) must not be used here.
 */
export function ProductPrice({
  variant,
}: {
  variant: CatalogProductVariantDto;
}) {
  if (variant.priceStatus === 'CALL_FOR_PRICE') {
    return <span>{CALL_FOR_PRICE_LABEL}</span>;
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-3">
      <span>{formatToman(variant.price)}</span>
      {variant.compareAtPrice ? (
        <s className="text-sm font-normal text-fg-muted">
          <span className="sr-only">قیمت پیشین </span>
          {formatToman(variant.compareAtPrice)}
        </s>
      ) : null}
    </span>
  );
}
