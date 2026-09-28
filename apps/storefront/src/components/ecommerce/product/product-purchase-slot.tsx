import type { CatalogProductVariantDto } from '@sabz/types';
import { RfqRequestButton } from './rfq-request-button';

/**
 * Non-purchasable purchase states (SS-214, narrowed SS-232). The purchasable
 * branch moved to `AddToCartButton` (rendered by `ProductPurchasePanel`);
 * call-for-price rows render the RFQ request island (SS-235 B2) — signed-in
 * users file a quotation request, guests get the partner-login link.
 * States are text-first (never color-only) and no control pretends to
 * purchase.
 */
export function ProductPurchaseSlot({
  variant,
  productName,
}: {
  variant: CatalogProductVariantDto;
  productName: string;
}) {
  if (variant.priceStatus === 'CALL_FOR_PRICE') {
    return (
      <RfqRequestButton variantId={variant.id} productName={productName} />
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
