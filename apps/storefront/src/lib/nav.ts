import type { CatalogCategoryNode } from '@sabz/types';

/**
 * Navigation helpers (SS-211): single place for desktop truncation policy and
 * search-submit param preservation. Components stay thin; logic is unit-tested.
 */

/** Max top-level categories shown in the desktop nav bar before overflow. */
export const DESKTOP_NAV_LIMIT = 6;

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

/** Whether a node has navigable children (drives disclosure vs plain link). */
export function categoryHasChildren(node: CatalogCategoryNode): boolean {
  return node.children.length > 0;
}

/**
 * Resolves the nodes the nav actually renders. The real catalog is a single
 * root ("کالای دیجیتال") with the browsable tree underneath — rendering the
 * lone root as one pill would hide the whole store. So a sole parent unwraps
 * to its children; multi-root trees (tests, future data) pass through.
 */
export function navRoots(categories: CatalogCategoryNode[]): CatalogCategoryNode[] {
  if (categories.length === 1 && categories[0]!.children.length > 0) {
    return categories[0]!.children;
  }
  return categories;
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
  if (trimmed) {
    next.set('q', trimmed.slice(0, 64));
  } else {
    next.delete('q');
  }
  next.delete('page');
  return next.toString();
}
