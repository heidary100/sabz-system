import type { CatalogCategoryNode } from '@sabz/types';
import { truncateQuery } from '@sabz/search';

/**
 * Navigation helpers (SS-211): single place for desktop truncation policy and
 * search-submit param preservation. Components stay thin; logic is unit-tested.
 */

/** Max top-level categories shown in the desktop nav bar before overflow. */
export const DESKTOP_NAV_LIMIT = 8;

/** Max child links previewed inside an index tile before the overflow link. */
export const CHILD_PREVIEW_LIMIT = 5;

/** Default number of facet values shown before the show-more toggle. */
export const FACET_DEFAULT_VISIBLE = 8;

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

/**
 * A category is visible in navigation only when its entire publicly visible
 * subtree has at least one published product. The API's
 * `publishedProductCount` is already rolled up, so a parent with no directly
 * assigned products still passes when a descendant has products.
 */
export function hasPublishedSubtree(node: CatalogCategoryNode): boolean {
  return node.publishedProductCount > 0;
}

/** Navigable children after applying the same zero-subtree rule. */
export function visibleCategoryChildren(
  node: CatalogCategoryNode,
): CatalogCategoryNode[] {
  return node.children.filter(hasPublishedSubtree);
}

/** Whether a node has navigable children (drives disclosure vs plain link). */
export function categoryHasChildren(node: CatalogCategoryNode): boolean {
  return visibleCategoryChildren(node).length > 0;
}

/**
 * Resolves the nodes the nav actually renders (SS-223).
 *
 * The real catalog is a single artificial trunk («کالای دیجیتال», ~99% of
 * products) plus stray minor roots — rendering the trunk as one pill would
 * hide the whole store. So a root holding at least DOMINANT_ROOT_SHARE of
 * all published products is unwrapped to its children, which become the
 * effective roots; the minor roots stay visible after them (reachable until
 * the SS-228 category merge). Balanced multi-root trees and a childless
 * sole root pass through untouched.
 */
const DOMINANT_ROOT_SHARE = 0.9;

export function navRoots(categories: CatalogCategoryNode[]): CatalogCategoryNode[] {
  const total = categories.reduce(
    (sum, category) => sum + category.publishedProductCount,
    0,
  );
  if (total === 0) {
    return [];
  }
  const trunk = categories.find(
    (category) =>
      category.children.length > 0 &&
      category.publishedProductCount / total >= DOMINANT_ROOT_SHARE,
  );
  if (!trunk) {
    return categories.every(hasPublishedSubtree)
      ? categories
      : categories.filter(hasPublishedSubtree);
  }
  const children = visibleCategoryChildren(trunk);
  if (children.length === 0) {
    return categories.every(hasPublishedSubtree)
      ? categories
      : categories.filter(hasPublishedSubtree);
  }
  return [
    ...children,
    ...categories.filter(
      (category) => category !== trunk && hasPublishedSubtree(category),
    ),
  ];
}

/**
 * Finds a category node by slug with a depth-first walk (SS-212). Returns
 * null when the slug is absent from the tree.
 */
export function findCategoryNode(
  categories: CatalogCategoryNode[],
  slug: string,
): CatalogCategoryNode | null {
  for (const category of categories) {
    if (category.slug === slug) {
      return category;
    }
    const child = findCategoryNode(category.children, slug);
    if (child) {
      return child;
    }
  }
  return null;
}

export interface CategoryCrumb {
  name: string;
  slug: string;
}

/**
 * Root-first ancestry path to the given slug, including the node itself
 * (SS-212). Empty when the slug is absent. Pure — derived from the
 * already-fetched tree, no extra request.
 */
export function findCategoryPath(
  categories: CatalogCategoryNode[],
  slug: string,
): CategoryCrumb[] {
  for (const category of categories) {
    if (category.slug === slug) {
      return [{ name: category.name, slug: category.slug }];
    }
    const childPath = findCategoryPath(category.children, slug);
    if (childPath.length > 0) {
      return [{ name: category.name, slug: category.slug }, ...childPath];
    }
  }
  return [];
}

export interface SiblingResult {
  /** Parent node, or null for root-level categories. */
  parent: CatalogCategoryNode | null;
  /** All nodes sharing the parent (including the current one). */
  siblings: CatalogCategoryNode[];
}

/**
 * Resolves the siblings of the given slug (SS-212): the children of its
 * parent, or the effective roots when the node is root-level. Root-level is
 * judged against `navRoots()` semantics so a sole-root catalog unwraps the
 * same way the header and index do.
 */
export function findSiblings(
  categories: CatalogCategoryNode[],
  slug: string,
): SiblingResult {
  const roots = navRoots(categories);
  if (roots.some((root) => root.slug === slug)) {
    return { parent: null, siblings: roots };
  }
  const parent = findParentNode(categories, slug);
  if (!parent) {
    return { parent: null, siblings: [] };
  }
  return { parent, siblings: parent.children };
}

function findParentNode(
  categories: CatalogCategoryNode[],
  slug: string,
): CatalogCategoryNode | null {
  for (const category of categories) {
    if (category.children.some((child) => child.slug === slug)) {
      return category;
    }
    const nested = findParentNode(category.children, slug);
    if (nested) {
      return nested;
    }
  }
  return null;
}

/**
 * Builds the query string for a search submit that stays on the current route:
 * preserves every existing param (category/brand/condition/sort), replaces `q`
 * (or drops it when empty) and resets `page`.
 */
export function buildSearchSubmitParams(current: URLSearchParams, trimmed: string): string {
  const next = new URLSearchParams(current.toString());
  // Grapheme-aware 64-character cap (SS-216), shared with the listing parser
  // and the API validation so every layer truncates identically.
  const capped = truncateQuery(trimmed);
  if (capped) {
    next.set('q', capped);
  } else {
    next.delete('q');
  }
  next.delete('page');
  return next.toString();
}

/**
 * Resolves the navigation target for a header search submit (SS-245 QA):
 * listing routes keep their facet state, every other route (home, product,
 * cart, account, …) would silently drop `q`, so the submit targets
 * `/products` there instead.
 */
export function searchSubmitPath(pathname: string, query: string): string {
  const isListingRoute =
    pathname === '/products' || pathname.startsWith('/categories/');
  if (isListingRoute) {
    return query ? `${pathname}?${query}` : pathname;
  }
  return query ? `/products?${query}` : '/products';
}
