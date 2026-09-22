import Link from 'next/link';
import type { CatalogCategoryNode } from '@sabz/types';
import { formatFaNumber } from '@/lib/format';

/**
 * Category index tile (SS-211): top-level category with its roll-up product
 * count and a preview of its children. Deeper landing work (descriptions,
 * child strips) lands in SS-212 — this tile only makes the tree browsable.
 */
export function CategoryTile({ category }: { category: CatalogCategoryNode }) {
  const preview = category.children.slice(0, 5);
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
