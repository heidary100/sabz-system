'use client';

import { useId, useState } from 'react';
import { FACET_DEFAULT_VISIBLE } from '@/lib/nav';
import { FacetShowMore } from './facet-show-more';

/**
 * Generic facet overflow wrapper (SS-212): shows the first `initialVisible`
 * items, hides the rest behind an explicit show-more/less toggle with
 * `aria-expanded` and a polite live region. Below the threshold no toggle
 * renders at all.
 */
export function FacetSection({
  title,
  total,
  initialVisible = FACET_DEFAULT_VISIBLE,
  children,
}: {
  title?: string;
  total: number;
  initialVisible?: number;
  children: (visibleCount: number, expanded: boolean) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const visibleCount = expanded ? total : initialVisible;

  return (
    <div>
      {title ? (
        <p className="text-sm font-semibold text-ink-900">{title}</p>
      ) : null}
      <div aria-live="polite" className="sr-only">
        {expanded ? 'همه موارد نمایش داده شد' : null}
      </div>
      <div id={listId}>{children(visibleCount, expanded)}</div>
      <FacetShowMore
        total={total}
        visibleCount={initialVisible}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        controlsId={listId}
      />
    </div>
  );
}
