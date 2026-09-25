'use client';

import { formatFaNumber } from '@/lib/format';

/**
 * Listing result-status line (SS-218). A client island so the text sits in a
 * stable, always-mounted `role="status"` node across URL-driven navigation:
 * server-rendered `aria-live` regions remount on every `router.push`, and a
 * remounted live region never announces (WCAG 4.1.3). The announcement is
 * the one-line count only — never the product grid.
 */
export function ResultStatus({
  total,
  filtering,
  query,
  className,
}: {
  total: number;
  /** Whether any listing filter/search is active. */
  filtering: boolean;
  /** Active search query, announced as «برای «…»». */
  query?: string;
  className?: string;
}) {
  return (
    <p role="status" aria-live="polite" className={className}>
      {resultStatusText(total, filtering, query)}
    </p>
  );
}

/** Pure announcement wording so it stays unit-testable without rendering. */
export function resultStatusText(
  total: number,
  filtering: boolean,
  query?: string,
): string {
  return `${formatFaNumber(total)} کالا${filtering ? ' با فیلترهای فعلی' : ''}${
    query ? ` برای «${query}»` : ''
  }`;
}
