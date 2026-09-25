/**
 * Mirror of the storefront's catalog cache tags
 * (`apps/storefront/src/lib/cache-tags.ts`). Two short constants lists
 * rather than a shared package: cache naming is a deployment contract
 * between exactly these two apps (see both files for the cross-reference).
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
