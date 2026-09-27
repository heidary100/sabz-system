import type { Metadata } from 'next';
import { OrdersList } from './orders-list';

export const metadata: Metadata = { title: 'سفارش‌ها' };

/** Server wrapper (SS-233): metadata lives here, interactivity in the island. */
export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">سفارش‌ها</h1>
      <div className="mt-6">
        <OrdersList />
      </div>
    </div>
  );
}
