import type { CatalogCategoryNode } from '@sabz/types';

/**
 * Navigation helpers (SS-211): single place for desktop truncation policy and
 * search-submit param preservation. Components stay thin; logic is unit-tested.
 */

/** Max top-level categories shown in the desktop nav bar before overflow. */
export const DESKTOP_NAV_LIMIT = 6;

export interface NavSplit {
  visible: CatalogCategoryNode[];
  /** Number of top-level categories hidden behind the "view all" link. */
  overflowCount: number;
  hasOverflow: boolean;
}

/** Splits the tree into visible top-level items + overflow behind `/categories`. */
export function splitNavCategories(
  categories: CatalogCategoryNode[],
  limit: number = DESKTOP_NAV_LIMIT,
): NavSplit {
  const visible = categories.slice(0, limit);
  const overflowCount = Math.max(0, categories.length - visible.length);
  return { visible, overflowCount, hasOverflow: overflowCount > 0 };
}

/** Whether a node has navigable children (drives disclosure vs plain link). */
export function categoryHasChildren(node: CatalogCategoryNode): boolean {
  return node.children.length > 0;
}

/**
 * Builds the query string for a search submit that stays on the current route:
 * preserves every existing param (category/brand/condition/sort), replaces `q`
 * (or drops it when empty) and resets `page`.
 */
export function buildSearchSubmitParams(current: URLSearchParams, trimmed: string): string {
  const next = new URLSearchParams(current.toString());
  if (trimmed) {
    next.set('q', trimmed.slice(0, 64));
  } else {
    next.delete('q');
  }
  next.delete('page');
  return next.toString();
}
