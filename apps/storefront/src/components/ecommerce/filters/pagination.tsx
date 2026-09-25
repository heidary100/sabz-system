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
          className="inline-flex min-h-11 items-center rounded-md border border-sand-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-sabz-300 hover:text-sabz-700"
        >
          قبلی
        </Link>
      ) : null}

      {windowStart > 1 ? (
        <Link
          href={makeHref(1)}
          className="inline-flex min-h-11 items-center rounded-md border border-sand-200 bg-white px-3.5 py-2 text-sm text-gray-600 hover:border-sabz-300"
        >
          {formatFaNumber(1)}
        </Link>
      ) : null}

      {pages.map((number) =>
        number === page ? (
          <span
            key={number}
            aria-current="page"
            className="inline-flex min-h-11 items-center rounded-md bg-sabz-700 px-3.5 py-2 text-sm font-semibold text-white"
          >
            {formatFaNumber(number)}
          </span>
        ) : (
          <Link
            key={number}
            href={makeHref(number)}
            className="inline-flex min-h-11 items-center rounded-md border border-sand-200 bg-white px-3.5 py-2 text-sm text-gray-600 hover:border-sabz-300 hover:text-sabz-700"
          >
            {formatFaNumber(number)}
          </Link>
        ),
      )}

      {windowEnd < totalPages ? (
        <Link
          href={makeHref(totalPages)}
          className="inline-flex min-h-11 items-center rounded-md border border-sand-200 bg-white px-3.5 py-2 text-sm text-gray-600 hover:border-sabz-300"
        >
          {formatFaNumber(totalPages)}
        </Link>
      ) : null}

      {page < totalPages ? (
        <Link
          href={makeHref(page + 1)}
          rel="next"
          className="inline-flex min-h-11 items-center rounded-md border border-sand-200 bg-white px-3 py-2 text-sm text-gray-600 hover:border-sabz-300 hover:text-sabz-700"
        >
          بعدی
        </Link>
      ) : null}
    </nav>
  );
}
