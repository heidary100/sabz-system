import type { CatalogCategoryNode, CatalogProductCardDto } from '@sabz/types';
import type { AnnouncementConfig } from '../config/home';
import { isAdvertisableInternalHref } from './site';
import { findCategoryNode, navRoots } from './nav';
import { salePercentFrom } from './format';

/**
 * Home curation helpers (SS-215 foundation). Pure — derived from the
 * already-fetched public category tree, no extra requests. Consumed by the
 * home page; the visual sections themselves belong to Muse.
 */

/**
 * Resolves the category tiles for the home page.
 *
 * 1. Explicit slugs first, in config order. Slugs are looked up in the full
 *    tree (so nested children are curatable), missing/hidden slugs are
 *    skipped, duplicates collapse, and the result is capped at `limit`.
 * 2. When no configured slug resolves (empty config or all stale), falls
 *    back to the effective roots (`navRoots()` semantics — a sole artificial
 *    root unwraps exactly like the header/nav/category surfaces) in the
 *    API's deterministic order (sortOrder → name → id), capped at `limit`.
 *
 * Never uses `tree[0]` or any positional pick for business meaning, never
 * randomizes, and never throws on an empty tree (returns `[]` so the section
 * hides instead of crashing the homepage).
 */
export function resolveFeaturedCategories(
  tree: CatalogCategoryNode[],
  slugs: readonly string[],
  limit: number,
): CatalogCategoryNode[] {
  const cap = Math.max(0, Math.floor(limit));
  if (cap === 0) {
    return [];
  }
  const curated: CatalogCategoryNode[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (curated.length >= cap) {
      break;
    }
    const node = findCategoryNode(tree, slug);
    if (node && !seen.has(node.id)) {
      seen.add(node.id);
      curated.push(node);
    }
  }
  if (curated.length > 0) {
    return curated;
  }
  return [...navRoots(tree)]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, cap);
}

/**
 * Section visibility for product rails: an empty rail hides, a non-empty
 * rail renders. No placeholder or dummy products are ever synthesized.
 */
export function shouldShowSection(items: readonly unknown[]): boolean {
  return items.length > 0;
}

/**
 * Resolves the configured announcement into a renderable value (or null).
 * Empty text disables the bar. A present-but-invalid `href` (placeholder
 * route, relative path, or unsafe URL) is stripped while keeping the text —
 * a store-wide message must never link to a dead destination.
 */
export function resolveAnnouncement(
  announcement: AnnouncementConfig | null,
): AnnouncementConfig | null {
  if (!announcement || announcement.text.trim() === '') {
    return null;
  }
  const { href, ...rest } = announcement;
  if (href === undefined || isAdvertisableInternalHref(href.trim())) {
    return announcement;
  }
  return { ...rest };
}

/** The hero is a campaign stage, not a catalog carousel. */
export const HOME_HERO_MAX = 3;

export function limitHeroSlides<T>(slides: readonly T[]): T[] {
  return slides.slice(0, HOME_HERO_MAX);
}

/**
 * A homepage offer is eligible only for an in-stock product with a real
 * compare-at discount or a currently active, future-ended promotion. A
 * compare-at price alone never creates a countdown.
 */
export function isOfferEligible(
  product: CatalogProductCardDto,
  now = Date.now(),
): boolean {
  if (
    !product.inStock ||
    product.callForPrice ||
    product.priceFrom === ''
  ) {
    return false;
  }
  const hasDiscount =
    salePercentFrom(product.priceFrom, product.compareAtPrice) !== null;
  const hasLivePromotion =
    product.promotionEndsAt !== null &&
    Date.parse(product.promotionEndsAt) > now;
  return hasDiscount || hasLivePromotion;
}

/** Earliest still-future promotion end among a collection, or null. */
export function earliestFuturePromotion(
  products: readonly CatalogProductCardDto[],
  now = Date.now(),
): string | null {
  const future = products
    .map((product) => product.promotionEndsAt)
    .filter((value): value is string => value !== null)
    .map((value) => ({ value, timestamp: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp > now)
    .sort((a, b) => a.timestamp - b.timestamp);
  return future[0]?.value ?? null;
}

/** One featured story plus up to two compact companions, or null when empty. */
export function splitBlogTeaser<T>(
  posts: readonly T[],
  secondaryLimit = 2,
): { feature: T; secondary: T[] } | null {
  if (posts.length === 0) {
    return null;
  }
  return {
    feature: posts[0]!,
    secondary: posts.slice(1, 1 + Math.max(0, secondaryLimit)),
  };
}

/** Resolved homepage commercial strip: real offers first, honest fallback. */
export interface HomeOfferSelection {
  products: CatalogProductCardDto[];
  mode: 'offer' | 'featured';
  /** Earliest real, still-future promotion end, or null. */
  endsAt: string | null;
}

/**
 * Selects the offer strip without inventing urgency. Eligible products must
 * be in stock and carry a compare-at discount or live future promotion; the
 * countdown only appears when a real future end timestamp exists. Otherwise
 * the strip falls back to in-stock newest products in a featured presentation.
 */
export function resolveHomeOffers(
  candidates: readonly CatalogProductCardDto[],
  fallback: readonly CatalogProductCardDto[],
  limit = 6,
  now = Date.now(),
): HomeOfferSelection {
  const cap = Math.max(0, Math.floor(limit));
  const eligible = candidates
    .filter((product) => isOfferEligible(product, now))
    .slice(0, cap);
  if (eligible.length > 0) {
    return {
      products: eligible,
      mode: 'offer',
      endsAt: earliestFuturePromotion(eligible, now),
    };
  }
  return {
    products: fallback
      .filter((product) => product.inStock)
      .slice(0, cap),
    mode: 'featured',
    endsAt: null,
  };
}
