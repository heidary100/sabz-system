import { describe, expect, it } from 'vitest';
import {
  BLOG_CATEGORIES_TAG,
  BLOG_POSTS_TAG,
  CATALOG_BRANDS_TAG,
  CATALOG_PRODUCTS_TAG,
  CATALOG_TREE_TAG,
  blogPostTag,
  isAllowedCatalogTag,
  productDetailTag,
} from './cache-tags';

/**
 * SS-217: the revalidation endpoint must accept exactly the catalog + blog
 * tags and reject everything else (allowlist test for POST /api/revalidate).
 */
describe('cache tag allowlist', () => {
  it('accepts the collection tags', () => {
    expect(isAllowedCatalogTag(CATALOG_TREE_TAG)).toBe(true);
    expect(isAllowedCatalogTag(CATALOG_BRANDS_TAG)).toBe(true);
    expect(isAllowedCatalogTag(CATALOG_PRODUCTS_TAG)).toBe(true);
    expect(isAllowedCatalogTag(BLOG_POSTS_TAG)).toBe(true);
    expect(isAllowedCatalogTag(BLOG_CATEGORIES_TAG)).toBe(true);
  });

  it('accepts well-formed product detail tags', () => {
    expect(isAllowedCatalogTag(productDetailTag('galaxy-s24'))).toBe(true);
    expect(isAllowedCatalogTag(productDetailTag('a1-b2-c3'))).toBe(true);
  });

  it('accepts well-formed blog post tags', () => {
    expect(isAllowedCatalogTag(blogPostTag('rahnamaye-kharid'))).toBe(true);
  });

  it('rejects malformed detail slugs and foreign tags', () => {
    expect(isAllowedCatalogTag('catalog:product:')).toBe(false);
    expect(isAllowedCatalogTag('catalog:product:پارسی')).toBe(false);
    expect(isAllowedCatalogTag('catalog:product:a b')).toBe(false);
    expect(isAllowedCatalogTag('blog:post:')).toBe(false);
    expect(isAllowedCatalogTag('blog:other')).toBe(false);
    expect(isAllowedCatalogTag('catalog:other')).toBe(false);
    expect(isAllowedCatalogTag('products')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isAllowedCatalogTag(null)).toBe(false);
    expect(isAllowedCatalogTag(undefined)).toBe(false);
    expect(isAllowedCatalogTag(42)).toBe(false);
    expect(isAllowedCatalogTag(['catalog:tree'])).toBe(false);
    expect(isAllowedCatalogTag({})).toBe(false);
  });
});
