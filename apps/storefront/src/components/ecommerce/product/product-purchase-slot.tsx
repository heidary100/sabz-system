import type { CatalogProductVariantDto } from '@sabz/types';

/**
 * Purchase-action placeholder (SS-214). This is NOT a cart: a visually
 * intentional integration boundary where Milestone 3 will plug in. States
 * are text-first (never color-only) and no control pretends to purchase.
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
  return (
    <div className="rounded-xl bg-sabz-50 p-4 text-sm text-sabz-800">
      <p className="font-semibold">موجود</p>
      <p className="mt-1 leading-6">
        خرید اینترنتی به‌زودی فعال می‌شود؛ در حال حاضر فقط مرور کاتالوگ
        امکان‌پذیر است.
      </p>
    </div>
  );
}
