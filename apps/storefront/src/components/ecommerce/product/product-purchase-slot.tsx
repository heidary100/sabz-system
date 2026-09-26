import type { CatalogProductVariantDto } from '@sabz/types';

/**
 * Non-purchasable purchase states (SS-214, narrowed SS-232). The purchasable
 * branch moved to `AddToCartButton` (rendered by `ProductPurchasePanel`);
 * this slot keeps the honest call-for-price / out-of-stock states that must
 * never offer an add action. States are text-first (never color-only) and no
 * control pretends to purchase.
 */
export function ProductPurchaseSlot({
  variant,
}: {
  variant: CatalogProductVariantDto;
}) {
  if (variant.priceStatus === 'CALL_FOR_PRICE') {
    return (
      <div className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
        <p className="font-semibold text-ink-900">برای قیمت تماس بگیرید</p>
        <p className="mt-1 leading-6 text-gray-600">
          قیمت این مدل متغیر است؛ برای استعلام با فروشگاه در تماس باشید.
        </p>
      </div>
    );
  }
  if (!variant.inStock) {
    return (
      <div className="rounded-xl border border-sand-200 bg-white p-4 text-sm">
        <p className="font-semibold text-ink-900">ناموجود</p>
        <p className="mt-1 leading-6 text-gray-600">
          این مدل فعلاً در انبار نیست.
        </p>
      </div>
    );
  }
  // Purchasable variants never reach this slot (the panel renders
  // `AddToCartButton` instead); reaching here is a programming error, so
  // render nothing rather than a fake purchase control.
  return null;
}
