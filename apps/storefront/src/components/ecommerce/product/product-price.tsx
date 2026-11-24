import type { CatalogProductVariantDto } from '@sabz/types';
import { CALL_FOR_PRICE_LABEL, formatToman, salePercentFrom } from '@/lib/format';

/**
 * Selected-variant price (SS-214, stabilization). Single source for
 * detail-page pricing: CALL_FOR_PRICE shows the contact label with no numeric
 * price; PRICED shows the server-resolved selling price plus a truthful
 * regular/discount breakdown. The API computes both values through the same
 * pricing engine as listing/cart/checkout — this component never recalculates
 * a sale on its own.
 */
export function ProductPrice({
  variant,
}: {
  variant: CatalogProductVariantDto;
}) {
  if (variant.priceStatus === 'CALL_FOR_PRICE') {
    return <span>{CALL_FOR_PRICE_LABEL}</span>;
  }

  const percent = salePercentFrom(variant.price, variant.regularPrice);
  const savings =
    variant.regularPrice !== null && Number(variant.price) > 0
      ? Number(variant.regularPrice) - Number(variant.price)
      : 0;

  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span>{formatToman(variant.price)}</span>
      {variant.regularPrice ? (
        <>
          <span className="inline-flex items-center rounded-pill bg-sale-soft px-2 py-0.5 text-xs font-bold text-sale">
            {percent !== null ? (
              <>
                <span className="sr-only">تخفیف </span>
                {percent.toLocaleString('fa-IR', { useGrouping: false })}٪
              </>
            ) : (
              'فروش ویژه'
            )}
          </span>
          <span className="basis-full text-xs font-normal text-fg-muted">
            <s className="decoration-1">
              <span className="sr-only">قیمت پیشین </span>
              {formatToman(variant.regularPrice)}
            </s>
            {savings > 0 ? (
              <span className="ms-2 text-success">
                {formatToman(String(savings))} سود شما
              </span>
            ) : null}
          </span>
        </>
      ) : null}
    </span>
  );
}
