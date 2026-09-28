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

/** Blog index + home teaser (collection-level). */
export const BLOG_POSTS_TAG = 'blog:posts';
/** Blog category list. */
export const BLOG_CATEGORIES_TAG = 'blog:categories';
/** Blog article pages, one tag per slug. */
export const BLOG_POST_TAG_PREFIX = 'blog:post:';

export function blogPostTag(slug: string): string {
  return `${BLOG_POST_TAG_PREFIX}${slug}`;
}
