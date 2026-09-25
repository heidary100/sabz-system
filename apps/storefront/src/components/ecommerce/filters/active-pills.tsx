'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import {
  buildListingHref,
  clearListingFilters,
  getActivePills,
  type ListingState,
} from '@/lib/listing';
import { CONDITION_LABELS } from '@/lib/condition';

/**
 * Active filter pills + clear-all (SS-213, UI layer).
 *
 * Pure state comes from `getActivePills(state, …)` — this component only
 * renders and navigates via the canonical `buildListingHref(basePath, …)`,
 * so pills can never leave the current pathname. Hidden when no facet is
 * active. Sort / page / perPage are deliberately never pills.
 */
export function ActivePills({
  state,
  basePath = '/products',
  brandName,
}: {
  state: ListingState;
  basePath?: string;
  /** Resolved brand name for the pill label; falls back to the brand slug. */
  brandName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const pills = getActivePills(state, {
    brandName,
    conditionLabels: CONDITION_LABELS,
  });
  if (pills.length === 0) {
    return null;
  }

  function remove(clear: Partial<ListingState>) {
    startTransition(() => {
      router.push(buildListingHref(basePath, state, clear));
    });
  }

  function clearAll() {
    startTransition(() => {
      router.push(buildListingHref(basePath, state, clearListingFilters()));
    });
  }

  return (
    <div
      className={`mb-4 ${pending ? 'opacity-60' : ''}`}
      aria-busy={pending}
    >
      <ul
        aria-label="فیلترهای فعال"
        className="flex flex-wrap items-center gap-2"
      >
        {pills.map((pill) => (
          <li key={pill.key}>
            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-sand-100 py-1 pe-2 ps-3 text-xs font-medium text-ink-900 ring-1 ring-inset ring-sand-200">
              {pill.label}
              <button
                type="button"
                onClick={() => remove(pill.clear)}
                aria-label={`حذف فیلتر ${pill.label}`}
                className="inline-flex size-8 items-center justify-center rounded-full text-gray-500 hover:bg-sand-200 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-600"
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-10 items-center rounded-full px-3 py-1 text-xs font-semibold text-sabz-700 hover:text-sabz-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-600"
          >
            پاک کردن فیلترها
          </button>
        </li>
      </ul>
    </div>
  );
}
