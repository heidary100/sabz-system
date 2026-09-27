import type { CheckoutSummaryDto } from '@sabz/types';
import { formatFaNumber, formatToman } from '@/lib/format';

/**
 * Order summary card (SS-233): mirrors the cart summary `aside + dl +
 * aria-live` pattern. Money is server-computed Rial rendered as Toman —
 * this component never computes prices.
 */
export function OrderSummary({ summary }: { summary: CheckoutSummaryDto }) {
  const priced = summary.items.filter((item) => item.inStock);
  const lineCount = priced.length;
  return (
    <aside
      aria-label="خلاصه سفارش"
      className="h-fit rounded-2xl border border-sand-200 bg-white p-5"
    >
      <h2 className="text-sm font-bold text-ink-900">خلاصه سفارش</h2>
      <ul role="list" className="mt-3 space-y-2 text-sm">
        {priced.map((item) => (
          <li key={item.variantId} className="flex items-start justify-between gap-3">
            <span className="leading-6 text-gray-600">
              {item.productName}
              <span className="text-gray-400"> × {formatFaNumber(item.quantity)}</span>
            </span>
            <span className="shrink-0 font-semibold text-ink-900">
              {formatToman(item.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-2 border-t border-sand-200 pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-600">تعداد اقلام قابل تسویه</dt>
          <dd className="font-semibold text-ink-900">{formatFaNumber(lineCount)} قلم</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-gray-600">هزینه ارسال</dt>
          <dd className="font-semibold text-ink-900">{formatToman(summary.shippingFee)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-sand-200 pt-3">
          <dt className="font-semibold text-ink-900">جمع سفارش</dt>
          <dd aria-live="polite" className="text-lg font-bold text-sabz-800">
            {formatToman(summary.total)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        قیمت‌ها به تومان و بر اساس آخرین قیمت فروشگاه محاسبه شده است.
      </p>
    </aside>
  );
}
