import Link from 'next/link';
import {
  buildListingHref,
  clearListingFilters,
  isFiltering,
  type ListingState,
} from '@/lib/listing';

/**
 * Listing empty state (SS-213, server component).
 *
 * Two cases, deliberately distinguished:
 * - Filters active → the filters eliminated the results: explain + one-click
 *   reset that stays on the current route (`basePath` untouched).
 * - Nothing active → the category genuinely has no published products yet:
 *   keep the existing catalog semantics, no reset action.
 */
export function EmptyState({
  state,
  basePath = '/products',
  emptyCategoryMessage = 'هنوز محصولی در این دسته‌بندی منتشر نشده است.',
}: {
  state: ListingState;
  basePath?: string;
  emptyCategoryMessage?: string;
}) {
  if (!isFiltering(state)) {
    return (
      <div className="rounded-xl border border-sand-200 bg-white px-6 py-20 text-center">
        <h2 className="text-lg font-semibold text-ink-900">محصولی یافت نشد</h2>
        <p className="mt-2 text-sm text-gray-500">{emptyCategoryMessage}</p>
      </div>
    );
  }

  const resetHref = buildListingHref(basePath, state, clearListingFilters());

  return (
    <div
      role="status"
      className="rounded-xl border border-sand-200 bg-white px-6 py-20 text-center"
    >
      <h2 className="text-lg font-semibold text-ink-900">
        محصولی با فیلترهای فعلی پیدا نشد.
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        فیلترها را تغییر دهید یا همه فیلترها را پاک کنید.
      </p>
      <Link
        href={resetHref}
        className="mt-6 inline-flex min-h-11 items-center rounded-md bg-sabz-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sabz-800"
      >
        پاک کردن فیلترها
      </Link>
    </div>
  );
}
