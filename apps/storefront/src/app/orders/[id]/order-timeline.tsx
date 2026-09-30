import type { OrderStatus } from '@sabz/types';
import { orderStatusLabel } from '@/lib/orders';

/**
 * Status timeline (SS-233, visual rework SS-246): the v1 lifecycle PENDING →
 * PROCESSING → SHIPPED → DELIVERED with CANCELLED as the terminal
 * side-state. Pure presentational — stages after the current one render
 * inert; completed stages get filled nodes, the current one pulses.
 */
const LIFECYCLE: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') {
    return (
      <ol aria-label="وضعیت سفارش" className="space-y-2 text-sm">
        <li className="flex items-center gap-2.5 font-semibold text-red-700">
          <span
            aria-hidden="true"
            className="flex size-4 items-center justify-center rounded-full bg-red-100 text-[10px] text-red-600"
          >
            ✕
          </span>
          لغو شده
        </li>
      </ol>
    );
  }
  const currentIndex = LIFECYCLE.indexOf(status);
  return (
    <ol aria-label="وضعیت سفارش" className="space-y-0 text-sm">
      {LIFECYCLE.map((stage, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const last = index === LIFECYCLE.length - 1;
        return (
          <li
            key={stage}
            aria-current={active ? 'step' : undefined}
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            {/* Connector rail between nodes (aria-hidden). */}
            {!last ? (
              <span
                aria-hidden="true"
                className={`absolute start-[7px] top-4 h-[calc(100%-1rem)] w-0.5 rounded-full ${
                  done ? 'bg-sabz-400' : 'bg-sand-200'
                }`}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={`relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ring-4 ${
                done
                  ? 'bg-sabz-500 ring-sabz-100'
                  : active
                    ? 'bg-sabz-600 ring-sabz-100'
                    : 'bg-sand-200 ring-white'
              }`}
            >
              {done ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="size-2.5 text-white">
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : null}
              {active ? (
                <span className="animate-ping absolute inline-flex size-3 rounded-full bg-sabz-400 opacity-60" />
              ) : null}
            </span>
            <span
              className={
                active
                  ? 'font-bold text-sabz-800'
                  : done
                    ? 'text-ink-900'
                    : 'text-gray-400'
              }
            >
              {orderStatusLabel(stage)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
