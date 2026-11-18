import { cache } from 'react';
import type {
  CatalogBrandDto,
  CatalogCategoryCoverDto,
  CatalogCategoryNode,
  CatalogCompareResponse,
  CatalogFacetsResponse,
  CatalogListQuery,
  CatalogProductCardDto,
  CatalogProductDetailDto,
  PaginatedResult,
} from '@sabz/types';
import { ApiError, API_BASE_URL, MEDIA_BASE_URL, request } from '@/lib/api';
import {
  resolveBrowserMediaUrl,
  resolveOptimizerMediaUrl,
} from '@/lib/api-url';
import { rialBound } from '@/lib/currency';
import {
  CATALOG_BRANDS_TAG,
  CATALOG_PRODUCTS_TAG,
  CATALOG_TREE_TAG,
  productDetailTag,
} from '@/lib/cache-tags';

/**
 * Typed catalog data access for server components (SS-119 contract).
 *
 * SS-217 caching: every helper reads through the Next.js Data Cache
 * (`cache: 'force-cache'` + revalidate window + tags) so repeated requests
 * within a cache window do not re-fetch from the API. Freshness comes from
 * event invalidation: the API POSTs changed tags to `/api/revalidate` after
 * committed mutations (see `app/api/revalidate`), so the revalidate values
 * below are only stale-while-invalidated safety nets. Helpers are wrapped in
 * React `cache()` so layout/page/metadata call sites within one render pass
 * share a single entry deterministically.
 */

/** Maximum slugs accepted by the cover endpoint. */
const CATEGORY_COVER_MAX = 12;

/** Data Cache revalidate windows (seconds) per resource. */
const REVALIDATE = {
  tree: 300,
  covers: 300,
  brands: 3600,
  products: 60,
  detail: 300,
} as const;

interface CatalogFetchInit {
  revalidate: number;
  tags: string[];
}

/**
 * Fetch options for a cached catalog read. Assigned to a typed variable
 * (not an inline literal) so the Next-specific `next` key passes the
 * api-client's `RequestInit` parameter without excess-property errors.
 */
function cachedFetchInit({ revalidate, tags }: CatalogFetchInit): RequestInit {
  const init: RequestInit & { next?: { revalidate: number; tags: string[] } } = {
    cache: 'force-cache',
    next: { revalidate, tags },
  };
  return init;
}

/**
 * Resolves a server-relative media URL from the API against the API origin so
 * it can be used directly by the browser (e.g. `<video>` sources, which are
 * fetched client-side and must stay on the browser-facing host).
 */
export function mediaUrl(path: string | null | undefined): string | null {
  return resolveBrowserMediaUrl(path, API_BASE_URL);
}

/**
 * Resolves a server-relative media URL against the optimizer-visible API
 * origin for `next/image` sources. The optimizer fetches upstream media
 * server-side, so inside Docker this must be the compose-internal hostname
 * (see MEDIA_BASE_URL); the browser never fetches this URL itself.
 */
export function mediaImageUrl(path: string | null | undefined): string | null {
  return resolveOptimizerMediaUrl(path, MEDIA_BASE_URL);
}

function toQueryString(query: CatalogListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.brand) params.set('brand', query.brand);
  if (query.condition) params.set('condition', query.condition);
  // SS-900: URL bounds and API bounds are both Rial. No conversion happens
  // in the storefront; the server owns validation and rounding.
  if (query.priceFrom) params.set('priceFrom', rialBound(query.priceFrom));
  if (query.priceTo) params.set('priceTo', rialBound(query.priceTo));
  if (query.attrs) params.set('attrs', query.attrs);
  if (query.inStockOnly) params.set('inStockOnly', 'true');
  if (query.rating) params.set('rating', query.rating);
  if (query.sort) params.set('sort', query.sort);
  return params.toString();
}

/** Root categories for navigation; never throws — the shell stays usable. */
export const fetchCategoryTree = cache(async (): Promise<CatalogCategoryNode[]> => {
  try {
    return await request<CatalogCategoryNode[]>(
      '/catalog/categories',
      cachedFetchInit({ revalidate: REVALIDATE.tree, tags: [CATALOG_TREE_TAG] }),
    );
  } catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
      return [];
    }
    return [];
  }
});

/** Ready-to-render navigation covers keyed by canonical category slug. */
export type CategoryCoverMap = Record<string, string | null>;

/**
 * Maps the API cover payload to `next/image` sources. The API returns
 * host-agnostic media paths; the optimizer needs the internal media origin.
 * A null image is preserved so navigation can render its semantic fallback.
 */
export function toCategoryCoverMap(
  rows: CatalogCategoryCoverDto[],
): CategoryCoverMap {
  const map: CategoryCoverMap = {};
  for (const row of rows) {
    if (typeof row?.slug !== 'string' || row.slug.length === 0) {
      continue;
    }
    map[row.slug] = mediaImageUrl(row.imageUrl);
  }
  return map;
}

/**
 * Derived category covers for the shell (Task 03). Callers pass a stable
 * comma-separated key so React/Next request caches can deduplicate the call
 * across nested layouts. Covers are tagged with both the category tree and
 * product collection tags: category moves/visibility and product/media
 * changes both invalidate them through the existing revalidation pipeline.
 */
export const fetchCategoryCovers = cache(
  async (slugsKey: string): Promise<CategoryCoverMap> => {
    const slugs = [
      ...new Set(
        slugsKey
          .split(',')
          .map((slug) => slug.trim())
          .filter(Boolean),
      ),
    ].slice(0, CATEGORY_COVER_MAX);
    if (slugs.length === 0) {
      return {};
    }
    try {
      const rows = await request<CatalogCategoryCoverDto[]>(
        `/catalog/categories/covers?slugs=${encodeURIComponent(slugs.join(','))}`,
        cachedFetchInit({
          revalidate: REVALIDATE.covers,
          tags: [CATALOG_TREE_TAG, CATALOG_PRODUCTS_TAG],
        }),
      );
      return toCategoryCoverMap(Array.isArray(rows) ? rows : []);
    } catch {
      // Navigation must stay usable when the optional cover capability is
      // unavailable or a deployment predates it.
      return {};
    }
  },
);

export const fetchBrands = cache(async (page = 1, limit = 50): Promise<PaginatedResult<CatalogBrandDto>> => {
  return request<PaginatedResult<CatalogBrandDto>>(
    `/catalog/brands?page=${page}&limit=${limit}`,
    cachedFetchInit({ revalidate: REVALIDATE.brands, tags: [CATALOG_BRANDS_TAG] }),
  );
});

export const fetchProducts = cache(async (
  query: CatalogListQuery,
): Promise<PaginatedResult<CatalogProductCardDto>> => {
  const qs = toQueryString(query);
  return request<PaginatedResult<CatalogProductCardDto>>(
    `/catalog/products${qs ? `?${qs}` : ''}`,
    cachedFetchInit({ revalidate: REVALIDATE.products, tags: [CATALOG_PRODUCTS_TAG] }),
  );
});

export const fetchProductBySlug = cache(async (
  slug: string,
): Promise<CatalogProductDetailDto | null> => {
  try {
    const product = await request<CatalogProductDetailDto>(
      `/catalog/products/${slug}`,
      cachedFetchInit({
        revalidate: REVALIDATE.detail,
        tags: [CATALOG_PRODUCTS_TAG, productDetailTag(slug)],
      }),
    );
    // Back-compat: API deployments predating SS-214 omit `related` and
    // variant `options`; deployments predating SS-227 omit the neighbour
    // navigation; deployments predating SS-236 omit review aggregates.
    // Default them so the detail page renders instead of
    // throwing on `undefined.length`.
    product.related ??= [];
    product.previous ??= null;
    product.next ??= null;
    product.ratingAverage ??= null;
    product.ratingCount ??= 0;
    for (const variant of product.variants ?? []) {
      variant.options ??= [];
    }
    return product;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
});


/** Category-aware attribute/brand facets (SS-900). */
export const fetchFacets = cache(
  async (category: string): Promise<CatalogFacetsResponse> => {
    try {
      return await request<CatalogFacetsResponse>(
        `/catalog/facets?category=${encodeURIComponent(category)}`,
        cachedFetchInit({ revalidate: REVALIDATE.products, tags: [CATALOG_PRODUCTS_TAG] }),
      );
    } catch {
      return { categorySlug: category, attributes: [], brands: [] };
    }
  },
);

/** Real API comparison projection (SS-900); stale slugs are ignored. */
export const fetchComparison = cache(
  async (slugs: string[]): Promise<CatalogCompareResponse | null> => {
    if (slugs.length === 0) {
      return null;
    }
    try {
      return await request<CatalogCompareResponse>(
        `/catalog/products/compare?slugs=${encodeURIComponent(slugs.join(','))}`,
        cachedFetchInit({ revalidate: REVALIDATE.products, tags: [CATALOG_PRODUCTS_TAG] }),
      );
    } catch {
      return null;
    }
  },
);
