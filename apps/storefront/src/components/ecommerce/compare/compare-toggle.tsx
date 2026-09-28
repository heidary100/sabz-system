'use client';

import { useState } from 'react';
import { useCompare } from './compare-provider';
import { COMPARE_FULL_MESSAGE } from '@/lib/compare';

interface CompareToggleProps {
  productId: string;
  slug: string;
  productName: string;
  className?: string;
}

/**
 * Compare toggle (SS-237): client island overlaid on product cards and the
 * detail page. Flips the local compare list optimistically; when the 4-slot
 * list is full the press is rejected with a Persian notice instead of
 * silently dropping a product. Guest-friendly — no session required.
 */
export function CompareToggle({
  productId,
  slug,
  productName,
  className = '',
}: CompareToggleProps) {
  const { ready, isCompared, toggle } = useCompare();
  const [fullNotice, setFullNotice] = useState(false);

  if (!ready) {
    return null;
  }

  const active = isCompared(productId);

  function handleToggle(): void {
    const accepted = toggle({ id: productId, slug });
    setFullNotice(!accepted);
  }

  return (
    <span className={`inline-flex flex-col items-end gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={active}
        aria-label={
          active
            ? `حذف ${productName} از مقایسه`
            : `افزودن ${productName} به مقایسه`
        }
        className={`flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white text-gray-500 shadow-card transition-colors hover:text-sabz-700 ${active ? 'text-sabz-700' : ''}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
          className="size-5"
        >
          <path
            d="M8.25 15 4.5 12l3.75-3m7.5 6 3.75-3-3.75-3M3 12h18"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {fullNotice ? (
        <span
          role="alert"
          className="max-w-40 rounded-md bg-white px-2 py-1 text-[11px] leading-4 text-red-700 shadow-card"
        >
          {COMPARE_FULL_MESSAGE}
        </span>
      ) : null}
    </span>
  );
}
