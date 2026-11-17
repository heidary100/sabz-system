import type { CatalogCategoryNode } from '@sabz/types';
import { findCategoryNode, navRoots } from './nav';

/**
 * Footer/global-chrome curation helpers.
 *
 * Homepage merchandising is resolved from the published homepage API; there
 * are deliberately no static hero, trust, campaign, offer, brand, or blog
 * helpers in this module.
 */

/**
 * Resolves the footer category links.
 *
 * 1. Explicit slugs first, in config order. Slugs are looked up in the full
 *    tree (so nested children are curatable), missing/hidden slugs are
 *    skipped, duplicates collapse, and the result is capped at `limit`.
 * 2. When no configured slug resolves (empty config or all stale), falls
 *    back to the effective roots (`navRoots()` semantics — a sole artificial
 *    root unwraps exactly like the header/nav/category surfaces) in the
 *    API's deterministic order (sortOrder → name → id), capped at `limit`.
 *
 * Never uses `tree[0]` or any positional pick for business meaning, never
 * randomizes, and never throws on an empty tree.
 */
export function resolveFeaturedCategories(
  tree: CatalogCategoryNode[],
  slugs: readonly string[],
  limit: number,
): CatalogCategoryNode[] {
  const cap = Math.max(0, Math.floor(limit));
  if (cap === 0) {
    return [];
  }
  const curated: CatalogCategoryNode[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (curated.length >= cap) {
      break;
    }
    const node = findCategoryNode(tree, slug);
    if (node && !seen.has(node.id)) {
      seen.add(node.id);
      curated.push(node);
    }
  }
  if (curated.length > 0) {
    return curated;
  }
  return [...navRoots(tree)]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, cap);
}
