import Link from 'next/link';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';

/**
 * Sibling navigation (SS-212): quiet pill row for related categories.
 * Renders nothing without meaningful siblings. Current category is marked
 * with `aria-current="page"`; the row scrolls horizontally on narrow screens.
 */
export function CategorySiblingNav({
  siblings,
  currentSlug,
}: {
  siblings: CatalogCategoryNode[];
  currentSlug: string;
}) {
  if (siblings.length <= 1) {
    return null;
  }

  return (
    <nav aria-label="دسته‌های هم‌رده">
      <ul role="list" className="flex gap-2 overflow-x-auto pb-1">
        {siblings.map((sibling) => {
          const isCurrent = sibling.slug === currentSlug;
          return (
            <li key={sibling.id} className="shrink-0">
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-transparent bg-sabz-700 px-4 py-2 text-sm font-semibold text-white"
                >
                  {sibling.name}
                  <span className="text-xs opacity-80">
                    {formatFaNumber(sibling.publishedProductCount)}
                  </span>
                </span>
              ) : (
                <Link
                  href={`/categories/${sibling.slug}`}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-sand-200 bg-white px-4 py-2 text-sm text-gray-600 hover:border-sabz-300 hover:text-sabz-700"
                >
                  {sibling.name}
                  <span className="text-xs text-gray-400">
                    {formatFaNumber(sibling.publishedProductCount)}
                  </span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
