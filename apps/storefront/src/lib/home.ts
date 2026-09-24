import type { CatalogCategoryNode } from '@sabz/types';
import type { AnnouncementConfig } from '../config/home';
import { isAdvertisableInternalHref } from './site';
import { findCategoryNode, navRoots } from './nav';

/**
 * Home curation helpers (SS-215 foundation). Pure — derived from the
 * already-fetched public category tree, no extra requests. Consumed by the
 * home page; the visual sections themselves belong to Muse.
 */

/**
 * Resolves the category tiles for the home page.
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
 * randomizes, and never throws on an empty tree (returns `[]` so the section
 * hides instead of crashing the homepage).
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

/**
 * Section visibility for product rails: an empty rail hides, a non-empty
 * rail renders. No placeholder or dummy products are ever synthesized.
 */
export function shouldShowSection(items: readonly unknown[]): boolean {
  return items.length > 0;
}

/**
 * Resolves the configured announcement into a renderable value (or null).
 * Empty text disables the bar. A present-but-invalid `href` (placeholder
 * route, relative path, or unsafe URL) is stripped while keeping the text —
 * a store-wide message must never link to a dead destination.
 */
export function resolveAnnouncement(
  announcement: AnnouncementConfig | null,
): AnnouncementConfig | null {
  if (!announcement || announcement.text.trim() === '') {
    return null;
  }
  const { href, ...rest } = announcement;
  if (href === undefined || isAdvertisableInternalHref(href.trim())) {
    return announcement;
  }
  return { ...rest };
}
