import type { Metadata } from 'next';
import { ReturnsList } from './returns-list';

export const metadata: Metadata = { title: 'مرجوعی‌ها' };

/** Server wrapper (SS-242): metadata lives here, interactivity in the island. */
export default function ReturnsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-balance text-2xl font-extrabold text-ink-900">مرجوعی‌ها</h1>
      <div className="mt-6">
        <ReturnsList />
      </div>
    </div>
  );
}
