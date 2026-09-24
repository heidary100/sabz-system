/**
 * Home page curation config (SS-215 foundation).
 *
 * Code/config curation in v1 — no CMS fields. Every value here is optional
 * merchandising: the UI must render correctly with the defaults below
 * (no announcement, no trust strip, data-driven category fallback).
 *
 * Rules for editors:
 * - Never put marketing claims, company facts, or contact details here that
 *   have not been supplied and verified. Missing content is represented as
 *   absent (`null` / `[]`), never as placeholder copy.
 * - `featuredCategorySlugs` are resolved against the live public category
 *   tree in the listed order; unknown or hidden slugs are silently skipped
 *   (see `resolveFeaturedCategories` in `@/lib/home`).
 */

export interface AnnouncementConfig {
  /** Store-wide message text (Persian). Empty text disables the bar. */
  text: string;
  /**
   * Optional internal destination (e.g. `/products`, `/categories`).
   * Must be a verified implemented route — never a placeholder page.
   */
  href?: string;
  /** Whether the visitor can dismiss the bar (local state only). */
  dismissible: boolean;
}

export type TrustItemIcon = 'shield' | 'truck' | 'badge' | 'support';

export interface TrustItem {
  icon: TrustItemIcon;
  title: string;
  body: string;
}

/**
 * Trust items come ONLY from this config — never derived from per-product
 * warranty fields, stock metadata, or import columns. An empty array hides
 * the entire trust strip until real company claims are supplied.
 */
export interface HomeConfig {
  /** Explicit category slugs in display order; empty = deterministic fallback. */
  featuredCategorySlugs: string[];
  /** Max category tiles on the home page. */
  maxCategoryTiles: number;
  /** Bounded `newest` query size for the latest-products rail. */
  latestLimit: number;
  /** Bounded `newest` + `inStockOnly` query size for the in-stock rail. */
  inStockLimit: number;
  /** Store-wide message; `null` hides the announcement bar entirely. */
  announcement: AnnouncementConfig | null;
  /** Company-level trust claims; `[]` hides the trust strip entirely. */
  trustItems: TrustItem[];
}

/**
 * Safe defaults: no announcement, no trust claims, no curated slugs, bounded
 * rail queries. The homepage is fully data-driven until curation is added.
 */
export const homeConfig: HomeConfig = {
  featuredCategorySlugs: [],
  maxCategoryTiles: 8,
  latestLimit: 8,
  inStockLimit: 8,
  announcement: null,
  trustItems: [],
};
