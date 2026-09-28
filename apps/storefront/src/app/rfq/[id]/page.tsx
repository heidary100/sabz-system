import type { Metadata } from 'next';
import { RfqDetail } from './rfq-detail';

export const metadata: Metadata = { title: 'جزئیات استعلام' };

/** Server wrapper (SS-235 B2): metadata lives here, interactivity in the island. */
export default async function RfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">جزئیات استعلام</h1>
      <div className="mt-6">
        <RfqDetail id={id} />
      </div>
    </div>
  );
}
