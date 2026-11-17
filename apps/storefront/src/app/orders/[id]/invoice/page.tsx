import type { Metadata } from 'next';
import { InvoiceView } from './invoice-view';

export const metadata: Metadata = { title: 'فاکتور سفارش' };

/** Server wrapper (SS-233): metadata lives here, interactivity in the island. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 print:p-0">
      <h1 className="text-2xl font-bold tracking-tight text-fg print:hidden">فاکتور سفارش</h1>
      <div className="mt-6">
        <InvoiceView id={id} />
      </div>
    </div>
  );
}
