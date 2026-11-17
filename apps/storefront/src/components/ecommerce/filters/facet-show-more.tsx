'use client';

import { formatFaNumber } from '@/lib/format';

/** Whether a facet needs a visible overflow toggle (pure, unit-tested). */
export function hasFacetOverflow(total: number, visibleCount: number): boolean {
  return total > visibleCount;
}

/**
 * Visible overflow toggle for facets (SS-212): never silently truncate.
 * A real button with `aria-expanded`/`aria-controls` and Persian counts.
 */
export function FacetShowMore({
  total,
  visibleCount,
  expanded,
  onToggle,
  controlsId,
}: {
  total: number;
  visibleCount: number;
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  if (!hasFacetOverflow(total, visibleCount)) {
    return null;
  }

  const hidden = total - visibleCount;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      className="mt-2 inline-flex min-h-11 items-center rounded-control px-1 text-xs font-semibold text-accent hover:text-accent-hover"
    >
      {expanded ? (
        <>نمایش کمتر</>
      ) : (
        <>نمایش بیشتر ({formatFaNumber(hidden)})</>
      )}
    </button>
  );
}
