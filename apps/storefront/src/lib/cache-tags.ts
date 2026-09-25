/**
 * Catalog cache tags — the single storefront-side source of truth for the
 * fetch Data Cache (SS-217).
 *
 * The API maintains a MIRROR of these names in
 * `apps/api/src/common/storefront-cache/catalog-tags.ts` (there is no shared
 * package dependency for cache concerns; the two lists are short and
 * referenced from each other in comments). The revalidation endpoint only
 * accepts tags that this module recognizes.
 */

/** Category tree (navigation shell, category pages, filters). */
export const CATALOG_TREE_TAG = 'catalog:tree';
/** Brand facet list. */
export const CATALOG_BRANDS_TAG = 'catalog:brands';
/** Product listings + home rails + search result pages (collection-level). */
export const CATALOG_PRODUCTS_TAG = 'catalog:products';
/** Product detail pages, one tag per slug. */
export const PRODUCT_DETAIL_TAG_PREFIX = 'catalog:product:';

export function productDetailTag(slug: string): string {
  return `${PRODUCT_DETAIL_TAG_PREFIX}${slug}`;
}

/** Slugs are API-generated ([a-z0-9-]); anything else is rejected. */
const PRODUCT_SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Whether a tag may be revalidated through the storefront endpoint.
 * Used by `app/api/revalidate` to reject unknown or malformed tags.
 */
export function isAllowedCatalogTag(tag: unknown): tag is string {
  return (
    typeof tag === 'string' &&
    (tag === CATALOG_TREE_TAG ||
      tag === CATALOG_BRANDS_TAG ||
      tag === CATALOG_PRODUCTS_TAG ||
      (tag.startsWith(PRODUCT_DETAIL_TAG_PREFIX) &&
        PRODUCT_SLUG_PATTERN.test(tag.slice(PRODUCT_DETAIL_TAG_PREFIX.length))))
  );
}
