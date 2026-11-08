'use client';

import { useRouter } from 'next/navigation';
import { useCompare } from './compare-provider';
import { buildCompareHref } from '@/lib/compare';

/**
 * Per-column remove button for the compare table (SS-237): drops the product
 * from the local list and rewrites the shareable URL so the server table
 * re-renders without it.
 */
export function CompareRemoveButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const { entries, remove } = useCompare();

  function handleRemove(): void {
    const remaining = entries
      .filter((row) => row.id !== productId)
      .map((row) => row.slug);
    // Navigate first (server re-renders the smaller table), then persist —
    // the provider is the source the next page sync adopts.
    router.replace(buildCompareHref(remaining));
    remove(productId);
  }

  return (
    <button
      type="button"
      onClick={handleRemove}
      aria-label={`حذف ${productName} از مقایسه`}
      className="flex min-h-9 items-center gap-1 rounded-control px-2 text-xs text-fg-muted hover:bg-danger-soft hover:text-danger"
    >
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-4">
        <path
          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      حذف
    </button>
  );
}
