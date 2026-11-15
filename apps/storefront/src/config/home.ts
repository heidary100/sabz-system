/**
 * Footer/global-chrome curation config.
 *
 * Homepage merchandising is owned exclusively by the published merchandising
 * API (`GET /api/v1/catalog/homepage`). Do not add hero, trust, campaign,
 * brand, offer, or blog curation here: the storefront homepage must not have a
 * static merchandising fallback.
 *
 * The remaining values are site chrome used by the footer category links.
 */

/** Legacy announcement-bar prop contract; the homepage does not use it. */
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

/** Legacy sale-banner prop contract; the homepage does not use it. */
export interface SaleBannerConfig {
  text: string;
  /** ISO timestamp the sale window ends at; the countdown hides on expiry. */
  endsAt: string;
  href?: string;
}

/** Legacy collection-banner tile contract; the homepage does not use it. */
export interface CategoryBanner {
  title: string;
  subtitle?: string;
  href: string;
}

/** Legacy app-distribution link contract; the homepage does not use it. */
export interface AppLink {
  label: string;
  href: string;
}

export interface HomeConfig {
  /** Footer category links in display order; empty = deterministic fallback. */
  featuredCategorySlugs: string[];
  /** Maximum footer category links. */
  maxCategoryTiles: number;
}

/**
 * Footer-only chrome values. The slugs are resolved against the live public
 * category tree in the listed order; unknown or hidden slugs are skipped
 * (see `resolveFeaturedCategories` in `@/lib/home`).
 */
export const homeConfig: HomeConfig = {
  featuredCategorySlugs: [
    'mobile-accessories',
    'computer-accessories',
    'stock-goods',
    'smart-gadgets',
    'game-consoles',
    'audio-video',
  ],
  maxCategoryTiles: 6,
};
