import type { CatalogProductSort } from '@sabz/types';

/**
 * URL search params are the single source of truth for the listing state
 * (/products and /categories/[slug]). These helpers are the only place that
 * encodes/decodes that state (SS-125).
 */

export const CATALOG_SORTS: CatalogProductSort[] = [
  'newest',
  'price_asc',
  'price_desc',
  'name',
];

export interface ListingState {
  q: string;
  category: string;
  brand: string;
  condition: string;
  sort: CatalogProductSort;
  page: number;
}

export const DEFAULT_LISTING_STATE: ListingState = {
  q: '',
  category: '',
  brand: '',
  condition: '',
  sort: 'newest',
  page: 1,
};

const VALID_CONDITIONS = new Set([
  'NEW',
  'OPEN_BOX',
  'REFURBISHED',
  'USED',
  'STOCK_CLEARANCE',
]);

/** Parses Next.js searchParams (all values string | string[] | undefined). */
export function parseListingState(
  params: Record<string, string | string[] | undefined>,
): ListingState {
  const first = (key: string): string => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? '';
  };

  const sort = first('sort') as CatalogProductSort;
  const page = Number.parseInt(first('page'), 10);

  return {
    q: first('q').slice(0, 64),
    category: first('category'),
    brand: first('brand'),
    condition: VALID_CONDITIONS.has(first('condition')) ? first('condition') : '',
    sort: CATALOG_SORTS.includes(sort) ? sort : 'newest',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** Builds a /products query string from a partial state change. */
export function buildListingQuery(
  current: ListingState,
  changes: Partial<ListingState>,
): string {
  const next = { ...current, ...changes, page: changes.page ?? 1 };
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.category) params.set('category', next.category);
  if (next.brand) params.set('brand', next.brand);
  if (next.condition) params.set('condition', next.condition);
  if (next.sort !== DEFAULT_LISTING_STATE.sort) params.set('sort', next.sort);
  if (next.page > 1) params.set('page', String(next.page));
  return params.toString();
}

/** Merges the category preset of /categories/[slug] into the state. */
export function withCategoryPreset(
  params: Record<string, string | string[] | undefined>,
  categorySlug: string,
): ListingState {
  return { ...parseListingState(params), category: categorySlug };
}
