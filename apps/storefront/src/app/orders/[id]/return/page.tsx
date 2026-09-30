import type { Metadata } from 'next';
import { ReturnRequestForm } from './return-request-form';

export const metadata: Metadata = { title: 'درخواست مرجوعی' };

/** Server wrapper (SS-242): metadata lives here, interactivity in the island. */
export default async function ReturnRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-balance text-2xl font-extrabold text-ink-900">درخواست مرجوعی</h1>
      <div className="mt-6">
        <ReturnRequestForm id={id} />
      </div>
    </div>
  );
}
