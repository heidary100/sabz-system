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
      className="h-fit rounded-panel border border-border bg-surface p-5"
    >
      <h2 className="text-sm font-bold text-fg">خلاصه سفارش</h2>
      <ul role="list" className="mt-3 space-y-2 text-sm">
        {priced.map((item) => (
          <li key={item.variantId} className="flex items-start justify-between gap-3">
            <span className="leading-6 text-fg-secondary">
              {item.productName}
              <span className="text-fg-muted"> × {formatFaNumber(item.quantity)}</span>
            </span>
            <span className="shrink-0 font-semibold text-fg">
              {formatToman(item.lineTotal)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fg-secondary">تعداد اقلام قابل تسویه</dt>
          <dd className="font-semibold text-fg">{formatFaNumber(lineCount)} قلم</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fg-secondary">هزینه ارسال</dt>
          <dd className="font-semibold text-fg">{formatToman(summary.shippingFee)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <dt className="font-semibold text-fg">جمع سفارش</dt>
          <dd aria-live="polite" className="text-lg font-bold text-accent-hover">
            {formatToman(summary.total)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-fg-muted">
        قیمت‌ها به تومان و بر اساس آخرین قیمت فروشگاه محاسبه شده است.
      </p>
    </aside>
  );
}
