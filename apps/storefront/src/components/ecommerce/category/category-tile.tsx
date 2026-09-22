import Link from 'next/link';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';
import { CHILD_PREVIEW_LIMIT } from '@/lib/nav';

export type CategoryTileVariant = 'index' | 'child';

/**
 * Shared category tile (SS-211 index tile, SS-212 child variant): one visual
 * language for `/categories` and child strips. `imageUrl` is reserved for a
 * future category-image field — never passed today, so imagery needs no API
 * rewrite later.
 */
export function CategoryTile({
  category,
  variant = 'index',
  imageUrl,
}: {
  category: CatalogCategoryNode;
  variant?: CategoryTileVariant;
  imageUrl?: string | null;
}) {
  void imageUrl;

  if (variant === 'child') {
    return (
      <li className="h-full">
        <Link
          href={`/categories/${category.slug}`}
          aria-label={`${category.name}، ${formatFaNumber(category.publishedProductCount)} کالا`}
          className="flex h-full min-h-11 items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white p-4 transition hover:border-sabz-300 hover:text-sabz-800"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink-900">
              {category.name}
            </span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {formatFaNumber(category.publishedProductCount)} کالا
            </span>
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4 shrink-0 text-gray-400"
          >
            <path
              fillRule="evenodd"
              d="M12.78 5.22a.75.75 0 0 1 0 1.06L8.06 11l4.72 4.72a.75.75 0 1 1-1.06 1.06l-5.25-5.25a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0Z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      </li>
    );
  }

  const preview = category.children.slice(0, CHILD_PREVIEW_LIMIT);
  const remaining = category.children.length - preview.length;

  return (
    <li className="flex h-full flex-col rounded-xl border border-sand-200 bg-white p-5 transition hover:border-sabz-300">
      <Link
        href={`/categories/${category.slug}`}
        className="rounded-sm text-base font-bold text-ink-900 hover:text-sabz-700"
      >
        {category.name}
      </Link>
      <p className="mt-1 text-xs text-gray-500">
        {formatFaNumber(category.publishedProductCount)} کالا
      </p>
      {preview.length > 0 ? (
        <ul role="list" className="mt-3 space-y-1.5 border-t border-sand-100 pt-3">
          {preview.map((child) => (
            <li key={child.id}>
              <Link
                href={`/categories/${child.slug}`}
                className="flex items-center justify-between rounded-sm text-sm text-gray-600 hover:text-sabz-700"
              >
                <span>{child.name}</span>
                <span className="text-xs text-gray-400">
                  {formatFaNumber(child.publishedProductCount)}
                </span>
              </Link>
            </li>
          ))}
          {remaining > 0 ? (
            <li>
              <Link
                href={`/categories/${category.slug}`}
                className="text-xs font-medium text-sabz-700 hover:text-sabz-800"
              >
                {formatFaNumber(remaining)} زیرمجموعه دیگر…
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
