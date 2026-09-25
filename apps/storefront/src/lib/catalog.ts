import { cache } from 'react';
import type {
  CatalogBrandDto,
  CatalogCategoryNode,
  CatalogListQuery,
  CatalogProductCardDto,
  CatalogProductDetailDto,
  PaginatedResult,
} from '@sabz/types';
import { ApiError, API_BASE_URL, MEDIA_BASE_URL, request } from '@/lib/api';
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

/** Data Cache revalidate windows (seconds) per resource. */
const REVALIDATE = {
  tree: 300,
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
  if (!path) {
    return null;
  }
  return new URL(path, API_BASE_URL).toString();
}

/**
 * Resolves a server-relative media URL against the optimizer-visible API
 * origin for `next/image` sources. The optimizer fetches upstream media
 * server-side, so inside Docker this must be the compose-internal hostname
 * (see MEDIA_BASE_URL); the browser never fetches this URL itself.
 */
export function mediaImageUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  return new URL(path, MEDIA_BASE_URL).toString();
}

function toQueryString(query: CatalogListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.brand) params.set('brand', query.brand);
  if (query.condition) params.set('condition', query.condition);
  if (query.priceFrom) params.set('priceFrom', query.priceFrom);
  if (query.priceTo) params.set('priceTo', query.priceTo);
  if (query.inStockOnly) params.set('inStockOnly', 'true');
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
    // variant `options`. Default them so the detail page renders instead of
    // throwing on `undefined.length`.
    product.related ??= [];
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
