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
          className="group flex h-full min-h-11 items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 transition-all duration-300 ease-[var(--ease-swift)] hover:-translate-y-0.5 hover:border-accent hover:shadow-card hover:text-accent-hover"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-fg transition-colors group-hover:text-accent-hover">
              {category.name}
            </span>
            <span className="mt-0.5 block text-xs text-fg-muted">
              {formatFaNumber(category.publishedProductCount)} کالا
            </span>
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="size-4 shrink-0 text-fg-muted transition-all duration-300 ease-[var(--ease-swift)] group-hover:-translate-x-1 group-hover:text-accent"
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
    <li className="flex h-full flex-col rounded-card border border-border bg-surface p-5 transition hover:border-accent">
      <Link
        href={`/categories/${category.slug}`}
        className="rounded-control text-base font-bold text-fg hover:text-accent"
      >
        {category.name}
      </Link>
      <p className="mt-1 text-xs text-fg-muted">
        {formatFaNumber(category.publishedProductCount)} کالا
      </p>
      {preview.length > 0 ? (
        <ul role="list" className="mt-3 space-y-1.5 border-t border-border pt-3">
          {preview.map((child) => (
            <li key={child.id}>
              <Link
                href={`/categories/${child.slug}`}
                className="flex items-center justify-between rounded-control text-sm text-fg-secondary hover:text-accent"
              >
                <span>{child.name}</span>
                <span className="text-xs text-fg-muted">
                  {formatFaNumber(child.publishedProductCount)}
                </span>
              </Link>
            </li>
          ))}
          {remaining > 0 ? (
            <li>
              <Link
                href={`/categories/${category.slug}`}
                className="text-xs font-medium text-accent hover:text-accent-hover"
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
