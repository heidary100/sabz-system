import type { Metadata } from 'next';
import { ReturnDetail } from './return-detail';

export const metadata: Metadata = { title: 'جزئیات مرجوعی' };

/** Server wrapper (SS-242): metadata lives here, interactivity in the island. */
export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-balance text-2xl font-extrabold text-fg">جزئیات مرجوعی</h1>
      <div className="mt-6">
        <ReturnDetail id={id} />
      </div>
    </div>
  );
}
