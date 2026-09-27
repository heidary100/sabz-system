import type { Metadata } from 'next';
import { OrderDetail } from './order-detail';

export const metadata: Metadata = { title: 'جزئیات سفارش' };

/** Server wrapper (SS-233): metadata lives here, interactivity in the island. */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">جزئیات سفارش</h1>
      <div className="mt-6">
        <OrderDetail id={id} />
      </div>
    </div>
  );
}
