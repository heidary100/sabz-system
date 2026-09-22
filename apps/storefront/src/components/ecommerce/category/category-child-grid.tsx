import type { CatalogCategoryNode } from '@sabz/types';
import { CategoryTile } from './category-tile';

/**
 * Child-category strip (SS-212): grid of compact shared tiles. Renders
 * nothing when the category is a leaf. Grid (not carousel) — the tree is
 * shallow and narrow, and grids stay RTL/scroll-safe at 360px.
 */
export function CategoryChildGrid({
  items,
}: {
  items: CatalogCategoryNode[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-label="زیرمجموعه‌ها">
      <ul
        role="list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {items.map((child) => (
          <CategoryTile key={child.id} category={child} variant="child" />
        ))}
      </ul>
    </section>
  );
}
