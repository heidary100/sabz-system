import type { Metadata } from 'next';
import { RfqList } from './rfq-list';

export const metadata: Metadata = { title: 'استعلام‌ها' };

/** Server wrapper (SS-235 B2): metadata lives here, interactivity in the island. */
export default function RfqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-balance text-2xl font-extrabold text-fg">استعلام‌ها</h1>
      <div className="mt-6">
        <RfqList />
      </div>
    </div>
  );
}
