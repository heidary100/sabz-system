import type { OrderStatus } from '@sabz/types';
import { orderStatusLabel } from '@/lib/orders';

/**
 * Status timeline (SS-233): the v1 lifecycle PENDING → PROCESSING →
 * SHIPPED → DELIVERED with CANCELLED as the terminal side-state. Pure
 * presentational — stages after the current one render inert.
 */
const LIFECYCLE: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') {
    return (
      <ol aria-label="وضعیت سفارش" className="space-y-2 text-sm">
        <li className="flex items-center gap-2 font-semibold text-red-700">
          <span aria-hidden="true">●</span> لغو شده
        </li>
      </ol>
    );
  }
  const currentIndex = LIFECYCLE.indexOf(status);
  return (
    <ol aria-label="وضعیت سفارش" className="space-y-2 text-sm">
      {LIFECYCLE.map((stage, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={stage}
            aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 ${
              active ? 'font-bold text-sabz-800' : done ? 'text-ink-900' : 'text-gray-400'
            }`}
          >
            <span aria-hidden="true">{done || active ? '●' : '○'}</span>
            {orderStatusLabel(stage)}
          </li>
        );
      })}
    </ol>
  );
}
