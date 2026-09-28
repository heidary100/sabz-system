import type { CatalogProductSort } from '@sabz/types';
import { truncateQuery } from '@sabz/search';
import { formatFaNumber } from './format';

/**
 * URL search params are the single source of truth for the listing state
 * (/products and /categories/[slug]). These helpers are the only place that
 * encodes/decodes that state (SS-125, SS-213).
 *
 * SS-213 canonical rules:
 * - `serializeListingSearch` + `buildListingHref` are the ONLY serializers.
 *   Page-local duplicates were removed; pagination uses the same builder.
 * - On `/categories/<slug>` the pathname owns the category: the query string
 *   must NEVER contain `category=<slug>`. On `/products` the optional
 *   `?category=` deep link is preserved.
 * - Defaults (`sort=newest`, `page=1`, `perPage=24`, `inStockOnly=false`,
 *   empty filters) are omitted from the query string.
 * - Every non-page mutation resets `page` to 1 (pre-existing convention).
 */

export const CATALOG_SORTS: CatalogProductSort[] = [
  'newest',
  'price_asc',
  'price_desc',
  'name',
];

/**
 * Star-bucket rating facet values (SS-236): exact average ranges owned by
 * the API (5 → avg ≥ 4.5, 4 → 3.5–4.5, 3 → 2.5–3.5, 2 → 1.5–2.5,
 * 1 → avg < 1.5). Offered top-down in the UI; `''` = absent.
 */
export const RATING_BUCKETS = ['5', '4', '3', '2', '1'] as const;
export type RatingBucket = (typeof RATING_BUCKETS)[number];

export interface ListingState {
  q: string;
  category: string;
  brand: string;
  condition: string;
  /**
   * Toman bound bound from the URL (user-facing, shareable). `fetchProducts`
   * converts ×10 to the API's Rial unit at the query boundary (SS-222).
   * '' = absent.
   */
  priceFrom: string;
  /** Toman bound from the URL; converted ×10 at the API boundary. '' = absent. */
  priceTo: string;
  inStockOnly: boolean;
  /** Star-bucket rating facet (SS-236). '' = absent. */
  rating: string;
  sort: CatalogProductSort;
  page: number;
  /** Storefront page size; translated to the API `limit` (max 50). */
  perPage: number;
}

export const DEFAULT_LISTING_STATE: ListingState = {
  q: '',
  category: '',
  brand: '',
  condition: '',
  priceFrom: '',
  priceTo: '',
  inStockOnly: false,
  rating: '',
  sort: 'newest',
  page: 1,
  perPage: 24,
};

/** Allowed page sizes. `LISTING_PER_PAGE_DEFAULT` is the URL omission default. */
export const LISTING_PER_PAGE_OPTIONS = [12, 24, 48] as const;
export const LISTING_PER_PAGE_DEFAULT = 24;

const VALID_CONDITIONS = new Set([
  'NEW',
  'OPEN_BOX',
  'REFURBISHED',
  'USED',
  'STOCK_CLEARANCE',
]);

/**
 * Numeric representation shared with the API (`PRICE_12_2_PATTERN` in
 * `apps/api/.../dto/create-variant.dto.ts`): up to 10 integer digits with an
 * optional 1–2 digit fraction. No price ceiling is imposed here — the
 * database `Decimal(12,2)` is the only bound.
 */
const PRICE_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

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
  const perPage = Number.parseInt(first('perPage'), 10);

  const rawFrom = first('priceFrom').trim();
  const rawTo = first('priceTo').trim();
  let priceFrom = PRICE_PATTERN.test(rawFrom) ? rawFrom : '';
  let priceTo = PRICE_PATTERN.test(rawTo) ? rawTo : '';
  // Normalize an inverted range by swapping (single shared policy: the API
  // service applies the same normalization before querying).
  if (priceFrom !== '' && priceTo !== '' && Number(priceFrom) > Number(priceTo)) {
    [priceFrom, priceTo] = [priceTo, priceFrom];
  }

  // Canonical wire values for truthy state: `true` (what we serialize) and
  // `1` (common URL boolean convention). Anything else is absent, never throwing.
  const stockRaw = first('inStockOnly').trim().toLowerCase();

  const ratingRaw = first('rating').trim();

  return {
    // Grapheme-aware 64-character cap (SS-216) — never splits surrogate
    // pairs or emoji ZWJ sequences the way a code-unit slice would.
    q: truncateQuery(first('q')),
    category: first('category'),
    brand: first('brand'),
    condition: VALID_CONDITIONS.has(first('condition')) ? first('condition') : '',
    priceFrom,
    priceTo,
    inStockOnly: stockRaw === 'true' || stockRaw === '1',
    rating: (RATING_BUCKETS as readonly string[]).includes(ratingRaw)
      ? ratingRaw
      : '',
    sort: CATALOG_SORTS.includes(sort) ? sort : 'newest',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
    perPage: (LISTING_PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? perPage
      : LISTING_PER_PAGE_DEFAULT,
  };
}

/**
 * Serializes a COMPLETE listing state to a query string, omitting defaults.
 * Includes `category` when present — route-awareness (dropping it on category
 * routes) belongs to `buildListingHref`, the only navigator-facing helper.
 */
export function serializeListingSearch(state: ListingState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.brand) params.set('brand', state.brand);
  if (state.condition) params.set('condition', state.condition);
  if (state.priceFrom) params.set('priceFrom', state.priceFrom);
  if (state.priceTo) params.set('priceTo', state.priceTo);
  if (state.inStockOnly) params.set('inStockOnly', 'true');
  if (state.rating) params.set('rating', state.rating);
  if (state.sort !== DEFAULT_LISTING_STATE.sort) params.set('sort', state.sort);
  if (state.perPage !== LISTING_PER_PAGE_DEFAULT)
    params.set('perPage', String(state.perPage));
  if (state.page > 1) params.set('page', String(state.page));
  return params.toString();
}

/**
 * Builds a /products query string from a partial state change.
 * Kept for backward compatibility; delegates to the canonical serializer.
 */
export function buildListingQuery(
  current: ListingState,
  changes: Partial<ListingState>,
): string {
  const next = { ...current, ...changes, page: changes.page ?? 1 };
  return serializeListingSearch(next);
}

/** Whether `basePath` is a category route (pathname owns the category). */
function isCategoryRoute(basePath: string): boolean {
  return basePath === '/categories' || basePath.startsWith('/categories/');
}

/**
 * THE canonical listing navigator (SS-213): merges `changes` into `state`,
 * resets `page` to 1 for every non-page mutation, serializes with default
 * omission, and returns the full href (`basePath` + optional `?…`).
 *
 * Category rule: on `/categories/<slug>` the `category` state is NEVER
 * serialized — the pathname already represents it. On `/products` an optional
 * `?category=` deep link is preserved.
 *
 * Navigation semantics: callers use `router.push(href)` (filter/sort/per-page)
 * or `<Link href>` (pagination) so Back/Forward walks through listing changes.
 */
export function buildListingHref(
  basePath: string,
  current: ListingState,
  changes: Partial<ListingState> = {},
): string {
  const next: ListingState = { ...current, ...changes, page: changes.page ?? 1 };
  if (isCategoryRoute(basePath)) {
    next.category = '';
  }
  const query = serializeListingSearch(next);
  return query ? `${basePath}?${query}` : basePath;
}

/** Merges the category preset of /categories/[slug] into the state. */
export function withCategoryPreset(
  params: Record<string, string | string[] | undefined>,
  categorySlug: string,
): ListingState {
  return { ...parseListingState(params), category: categorySlug };
}

/**
 * Filter reset for the "clear all" interaction (SS-213): clears every
 * narrowing facet and returns to the first page, but PRESERVES `sort` and
 * `perPage` — they are presentation preferences, not filters. The pathname
 * (hence category context) is untouched; apply via
 * `buildListingHref(basePath, state, clearListingFilters())`.
 */
export function clearListingFilters(): Partial<ListingState> {
  return {
    q: '',
    brand: '',
    condition: '',
    priceFrom: '',
    priceTo: '',
    inStockOnly: false,
    rating: '',
    page: 1,
  };
}

/** True when any narrowing facet is active (drives pills/empty states). */
export function isFiltering(state: ListingState): boolean {
  return (
    state.q !== '' ||
    state.brand !== '' ||
    state.condition !== '' ||
    state.priceFrom !== '' ||
    state.priceTo !== '' ||
    state.inStockOnly ||
    state.rating !== ''
  );
}

export type ActivePillKey = 'q' | 'brand' | 'condition' | 'price' | 'inStock' | 'rating';

export interface ActivePill {
  key: ActivePillKey;
  /** Persian display label, e.g. `برند: ORICO`. */
  label: string;
  /** Partial state that removes exactly this pill (page reset handled by the href builder). */
  clear: Partial<ListingState>;
}

function formatTomanFa(value: string): string {
  // Whole Tomans, like formatToman (fractional parts are always zero in
  // Toman retail prices and are dropped for display consistency).
  return formatFaNumber(Math.floor(Number(value)));
}

/**
 * Pure active-filter representation for the pills UI (SS-213). Deliberately
 * excludes `sort`, `page`, and `perPage`: sort lives in its select,
 * pagination/per-page are navigation, not filters.
 *
 * `brandName` lets the UI show the resolved brand name with a safe slug
 * fallback when the brand object is unavailable.
 */
export function getActivePills(
  state: ListingState,
  opts: { brandName?: string; conditionLabels?: Record<string, string> } = {},
): ActivePill[] {
  const pills: ActivePill[] = [];
  if (state.q) {
    pills.push({ key: 'q', label: `جستجو: ${state.q}`, clear: { q: '' } });
  }
  if (state.brand) {
    pills.push({
      key: 'brand',
      label: `برند: ${opts.brandName ?? state.brand}`,
      clear: { brand: '' },
    });
  }
  if (state.condition) {
    const conditionLabel = opts.conditionLabels?.[state.condition] ?? state.condition;
    pills.push({
      key: 'condition',
      label: `وضعیت: ${conditionLabel}`,
      clear: { condition: '' },
    });
  }
  if (state.priceFrom !== '' || state.priceTo !== '') {
    const from = state.priceFrom !== '' ? formatTomanFa(state.priceFrom) : null;
    const to = state.priceTo !== '' ? formatTomanFa(state.priceTo) : null;
    const range =
      from !== null && to !== null
        ? `${from} تا ${to}`
        : from !== null
          ? `از ${from}`
          : `تا ${to}`;
    pills.push({
      key: 'price',
      label: `قیمت: ${range}`,
      clear: { priceFrom: '', priceTo: '' },
    });
  }
  if (state.inStockOnly) {
    pills.push({ key: 'inStock', label: 'فقط موجود', clear: { inStockOnly: false } });
  }
  if (state.rating) {
    pills.push({
      key: 'rating',
      label: `امتیاز: ${formatFaNumber(Number(state.rating))} ستاره`,
      clear: { rating: '' },
    });
  }
  return pills;
}
