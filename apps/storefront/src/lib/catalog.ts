import type {
  CatalogBrandDto,
  CatalogCategoryNode,
  CatalogListQuery,
  CatalogProductCardDto,
  CatalogProductDetailDto,
  PaginatedResult,
} from '@sabz/types';
import { ApiError, API_BASE_URL, request } from '@/lib/api';

/**
 * Typed catalog data access for server components (SS-119 contract).
 * Relative media URLs returned by the API are already absolute paths under
 * the API origin — next/image resolves them through remotePatterns.
 */

/**
 * Resolves a server-relative media URL from the API against the API origin so
 * next/image can load it (the storefront origin does not host media).
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  return new URL(path, API_BASE_URL).toString();
}

function toQueryString(query: CatalogListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.brand) params.set('brand', query.brand);
  if (query.condition) params.set('condition', query.condition);
  if (query.sort) params.set('sort', query.sort);
  return params.toString();
}

/** Root categories for navigation; never throws — the shell stays usable. */
export async function fetchCategoryTree(): Promise<CatalogCategoryNode[]> {
  try {
    return await request<CatalogCategoryNode[]>('/catalog/categories');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
      return [];
    }
    return [];
  }
}

export async function fetchBrands(page = 1, limit = 50): Promise<PaginatedResult<CatalogBrandDto>> {
  return request<PaginatedResult<CatalogBrandDto>>(
    `/catalog/brands?page=${page}&limit=${limit}`,
  );
}

export async function fetchProducts(
  query: CatalogListQuery,
): Promise<PaginatedResult<CatalogProductCardDto>> {
  const qs = toQueryString(query);
  return request<PaginatedResult<CatalogProductCardDto>>(
    `/catalog/products${qs ? `?${qs}` : ''}`,
  );
}

export async function fetchProductBySlug(
  slug: string,
): Promise<CatalogProductDetailDto | null> {
  try {
    return await request<CatalogProductDetailDto>(`/catalog/products/${slug}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
