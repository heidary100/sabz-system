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
  /** Optional supporting line; omit when no verified subtext exists. */
  body?: string;
}

/** One hero-slider slide (SS-224). Content must be factual — real routes, real categories, no invented claims. */
export interface HeroSlide {
  title: string;
  subtitle?: string;
  /** Advertised internal route (validated like every advertised link). */
  href: string;
  ctaLabel: string;
  /**
   * Real catalog category used to source representative product imagery for
   * the campaign stage. No editorial hero asset is implied.
   */
  categorySlug?: string;
}

/** Config-driven sale countdown bar; the real sale engine arrives with SS-235. */
export interface SaleBannerConfig {
  text: string;
  /** ISO timestamp the sale window ends at; the countdown hides on expiry. */
  endsAt: string;
  href?: string;
}

/** One brand-showcase tab; the slug must exist in the public catalog. */
export interface BrandTab {
  name: string;
  slug: string;
}

/** One collection banner tile. */
export interface CategoryBanner {
  title: string;
  subtitle?: string;
  href: string;
}

/** One verified app-store/distribution link; [] hides the app section. */
export interface AppLink {
  label: string;
  href: string;
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
  /** Ordered hero slides; `[]` hides the slider. */
  heroSlides: HeroSlide[];
  /** Sale countdown bar; `null` hides it entirely (needs a real window). */
  saleBanner: SaleBannerConfig | null;
  /** Brand showcase tabs — real catalog brand slugs; `[]` hides the section. */
  brandTabs: BrandTab[];
  /** Collection banner tiles; `[]` hides the section. */
  categoryBanners: CategoryBanner[];
  /** Verified app distribution links; `[]` hides the app section. */
  appLinks: AppLink[];
  /** Bounded name-sorted preview size for the alphabetical browse rail. */
  alphabeticalLimit: number;
}

/**
 * SS-224 values: claims verified from the client's live website
 * (sabzsistem.com, 2026-09-25) — trust claims are the site's own «5 دلیل»
 * strip and footer services; hero slides point at real catalog routes and
 * use representative catalog imagery, never an editorial claim.
 * `saleBanner` and `appLinks` stay disabled until the client supplies a real
 * sale window / verified app URLs (anti-fabrication rule).
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
  latestLimit: 6,
  inStockLimit: 4,
  announcement: null,
  trustItems: [
    { icon: 'support', title: 'پشتیبانی ۲۴ ساعته', body: 'پاسخگویی هفت روز هفته، ۲۴ ساعت شبانه‌روز' },
    { icon: 'truck', title: 'ارسال سریع سفارش' },
    { icon: 'shield', title: 'تضمین کیفیت', body: 'تضمین اصالت کالا' },
    { icon: 'badge', title: 'پرداخت در محل' },
  ],
  heroSlides: [
    {
      title: 'فروشگاه کالای دیجیتال سبز سیستم',
      subtitle: 'موبایل، لوازم جانبی، رایانه و گجت‌های هوشمند — از برندهای معتبر بازار',
      href: '/products',
      ctaLabel: 'مشاهده محصولات',
      categorySlug: 'computer-accessories',
    },
    {
      title: 'کالای استوک',
      subtitle: 'لپ‌تاپ، کامپیوتر و کنسول استوک — دسته‌بندی کالای استوک',
      href: '/categories/stock-goods',
      ctaLabel: 'مشاهده کالای استوک',
      categorySlug: 'stock-goods',
    },
    {
      title: 'لوازم جانبی گوشی موبایل',
      subtitle: 'پاوربانک، هدفون، اسپیکر و شارژر از پرودو، پاورولوژی و گرین لاین',
      href: '/categories/mobile-accessories',
      ctaLabel: 'مشاهده دسته‌بندی',
      categorySlug: 'mobile-accessories',
    },
  ],
  saleBanner: null,
  brandTabs: [
    { name: 'گرین لاین', slug: 'green-lion-2' },
    { name: 'پرودو', slug: 'porodo-2' },
    { name: 'پاورولوژی', slug: 'powerology-2' },
    { name: 'proone', slug: 'proone' },
    { name: 'اوریکو', slug: 'orico' },
  ],
  categoryBanners: [
    {
      title: 'کالای استوک',
      subtitle: 'لپ‌تاپ استوک اصل با موجودی واقعی',
      href: '/categories/stock-goods',
    },
    {
      title: 'گجت‌های هوشمند',
      subtitle: 'ساعت و دستبند هوشمند',
      href: '/categories/smart-gadgets',
    },
    {
      title: 'کنسول بازی',
      subtitle: 'کنسول‌های قابل حمل و خانگی',
      href: '/categories/game-consoles',
    },
  ],
  appLinks: [],
  alphabeticalLimit: 8,
};
