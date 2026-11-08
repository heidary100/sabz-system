import Link from 'next/link';
import type { PaginatedResult } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';

/**
 * Server-rendered pagination (SS-125): plain links over the URL params, with
 * Persian numerals and a window around the current page.
 */
export function Pagination({
  result,
  makeHref,
}: {
  result: PaginatedResult<unknown>;
  makeHref: (page: number) => string;
}) {
  const { page, total, limit } = result;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) {
    return null;
  }

  const windowStart = Math.max(1, page - 2);
  const windowEnd = Math.min(totalPages, windowStart + 4);
  const pages = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, index) => windowStart + index,
  );

  return (
    <nav aria-label="صفحه‌بندی" className="mt-10 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link
          href={makeHref(page - 1)}
          rel="prev"
          className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg-secondary transition-colors duration-200 hover:border-accent hover:text-accent"
        >
          قبلی
        </Link>
      ) : null}

      {windowStart > 1 ? (
        <Link
          href={makeHref(1)}
          className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-3.5 py-2 text-sm text-fg-secondary transition-colors duration-200 hover:border-accent hover:text-accent"
        >
          {formatFaNumber(1)}
        </Link>
      ) : null}

      {pages.map((number) =>
        number === page ? (
          <span
            key={number}
            aria-current="page"
            className="animate-pop inline-flex min-h-11 items-center rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent shadow-card"
          >
            {formatFaNumber(number)}
          </span>
        ) : (
          <Link
            key={number}
            href={makeHref(number)}
            className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-3.5 py-2 text-sm text-fg-secondary hover:border-accent hover:text-accent"
          >
            {formatFaNumber(number)}
          </Link>
        ),
      )}

      {windowEnd < totalPages ? (
        <Link
          href={makeHref(totalPages)}
          className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-3.5 py-2 text-sm text-fg-secondary transition-colors duration-200 hover:border-accent hover:text-accent"
        >
          {formatFaNumber(totalPages)}
        </Link>
      ) : null}

      {page < totalPages ? (
        <Link
          href={makeHref(page + 1)}
          rel="next"
          className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-3 py-2 text-sm text-fg-secondary transition-colors duration-200 hover:border-accent hover:text-accent"
        >
          بعدی
        </Link>
      ) : null}
    </nav>
  );
}
