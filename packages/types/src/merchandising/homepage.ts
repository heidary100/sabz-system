import type { PaginatedResult } from '../api/pagination';
import type {
  CatalogCategoryNode,
  CatalogProductCardDto,
  CatalogProductSort,
  CatalogRefDto,
} from '../catalog/catalog';
import type { BlogPostCardDto } from '../blog/blog';
import type { MerchCampaignSnapshot, MerchCampaignType, MerchCtaTarget } from './campaign';

/**
 * Homepage merchandising contracts (Task 05.1).
 *
 * Draft sections reference campaign IDs and are validated by the server-side
 * section registry. Published snapshots embed frozen campaign display content.
 * Public resolved DTOs reuse the existing catalog/blog card contracts; they do
 * not duplicate prices, stock, promotion, or product DTOs.
 */

export const MERCH_HOMEPAGE_SCHEMA_VERSION = 1;
/** Singleton key for the one working homepage draft row. */
export const MERCH_HOMEPAGE_DRAFT_ID = 'homepage';
export const HOMEPAGE_MAX_SECTIONS = 12;
export const MERCH_HERO_MAX_SLIDES = 3;
export const MERCH_TRUST_STRIP_MAX_ITEMS = 4;
export const MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES = 6;
export const MERCH_OFFER_STRIP_MAX_PRODUCTS = 6;
export const MERCH_READY_TO_SHIP_MAX_PRODUCTS = 8;
export const MERCH_PRODUCT_RAIL_MAX_PRODUCTS = 12;
export const MERCH_BRAND_SHOWCASE_MAX_BRANDS = 5;
export const MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND = 6;
export const MERCH_BLOG_FEATURE_MAX_POSTS = 3;
export const MERCH_CAMPAIGN_MAX_PRODUCTS = 12;
export const MERCH_CAMPAIGN_MAX_CATEGORIES = 6;
export const MERCH_CAMPAIGN_MAX_BRANDS = 5;
export const MERCH_CAMPAIGN_MAX_MEDIA = 4;

export const HOMEPAGE_SECTION_TYPES = [
  'HERO_CAROUSEL',
  'TRUST_STRIP',
  'CATEGORY_DISCOVERY',
  'OFFER_STRIP',
  'CATEGORY_SPOTLIGHT',
  'READY_TO_SHIP',
  'PRODUCT_RAIL',
  'BRAND_SHOWCASE',
  'BLOG_FEATURE',
] as const;

export type HomepageSectionType = (typeof HOMEPAGE_SECTION_TYPES)[number];

export const MERCH_TRUST_ICONS = ['shield', 'truck', 'badge', 'support'] as const;
export type MerchTrustIcon = (typeof MERCH_TRUST_ICONS)[number];

export interface MerchTrustItem {
  icon: MerchTrustIcon;
  title: string;
  body?: string;
}

export type OfferStripFallback = 'featured' | 'hide';

export type ProductRailSort = CatalogProductSort;

export type ProductRailSource =
  | { kind: 'campaign'; campaignId: string }
  | {
      kind: 'query';
      categoryId?: string | null;
      brandId?: string | null;
      sort?: ProductRailSort;
      limit: number;
      inStockOnly?: boolean;
    };

export type ProductRailSnapshotSource =
  | { kind: 'campaign'; campaign: MerchCampaignSnapshot }
  | {
      kind: 'query';
      categoryId: string | null;
      brandId: string | null;
      sort: ProductRailSort | null;
      limit: number;
      inStockOnly: boolean;
    };

export interface HomepageSectionBase<
  TType extends HomepageSectionType,
  TSettings,
> {
  key: string;
  type: TType;
  order: number;
  isVisible: boolean;
  settings: TSettings;
}

export interface HeroCarouselSettings {
  campaignIds: string[];
}

export interface TrustStripSettings {
  items: MerchTrustItem[];
}

export interface CategoryDiscoverySettings {
  campaignId: string;
}

export interface OfferStripSettings {
  campaignId: string;
  fallback: OfferStripFallback;
}

export interface CategorySpotlightSettings {
  campaignId: string;
  categoryId: string;
  secondaryCategoryId: string | null;
}

export interface ReadyToShipSettings {
  limit: number;
  title?: string;
  subtitle?: string;
}

export interface ProductRailSettings {
  title: string;
  subtitle?: string;
  actionHref?: string;
  source: ProductRailSource;
}

export interface BrandShowcaseSettings {
  campaignId: string;
  productsPerBrand: number;
}

export type BlogFeatureSettings =
  | { source: 'latest'; limit: number }
  | { source: 'manual'; postIds: string[] };

export type HeroCarouselSection = HomepageSectionBase<'HERO_CAROUSEL', HeroCarouselSettings>;

export type TrustStripSection = HomepageSectionBase<'TRUST_STRIP', TrustStripSettings>;

export type CategoryDiscoverySection = HomepageSectionBase<'CATEGORY_DISCOVERY', CategoryDiscoverySettings>;

export type OfferStripSection = HomepageSectionBase<'OFFER_STRIP', OfferStripSettings>;

export type CategorySpotlightSection = HomepageSectionBase<'CATEGORY_SPOTLIGHT', CategorySpotlightSettings>;

export type ReadyToShipSection = HomepageSectionBase<'READY_TO_SHIP', ReadyToShipSettings>;

export type ProductRailSection = HomepageSectionBase<'PRODUCT_RAIL', ProductRailSettings>;

export type BrandShowcaseSection = HomepageSectionBase<'BRAND_SHOWCASE', BrandShowcaseSettings>;

export type BlogFeatureSection = HomepageSectionBase<'BLOG_FEATURE', BlogFeatureSettings>;

/** Strict draft-section union. New types must be added explicitly. */
export type HomepageDraftSection =
  | HeroCarouselSection
  | TrustStripSection
  | CategoryDiscoverySection
  | OfferStripSection
  | CategorySpotlightSection
  | ReadyToShipSection
  | ProductRailSection
  | BrandShowcaseSection
  | BlogFeatureSection;

export interface HomepageDraftDto {
  revision: number;
  schemaVersion: number;
  sections: HomepageDraftSection[];
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Published snapshot contracts
// ---------------------------------------------------------------------------

export interface HeroCarouselSnapshotSettings {
  campaigns: MerchCampaignSnapshot[];
}

export interface CategoryDiscoverySnapshotSettings {
  campaign: MerchCampaignSnapshot;
}

export interface OfferStripSnapshotSettings {
  campaign: MerchCampaignSnapshot;
  fallback: OfferStripFallback;
}

export interface CategorySpotlightSnapshotSettings {
  campaign: MerchCampaignSnapshot;
  categoryId: string;
  secondaryCategoryId: string | null;
}

export interface ProductRailSnapshotSettings {
  title: string;
  subtitle?: string;
  actionHref?: string;
  source: ProductRailSnapshotSource;
}

export interface BrandShowcaseSnapshotSettings {
  campaign: MerchCampaignSnapshot;
  productsPerBrand: number;
}

export type HeroCarouselSnapshotSection = HomepageSectionBase<'HERO_CAROUSEL', HeroCarouselSnapshotSettings>;

export type TrustStripSnapshotSection = HomepageSectionBase<'TRUST_STRIP', TrustStripSettings>;

export type CategoryDiscoverySnapshotSection = HomepageSectionBase<
  'CATEGORY_DISCOVERY',
  CategoryDiscoverySnapshotSettings
>;

export type OfferStripSnapshotSection = HomepageSectionBase<'OFFER_STRIP', OfferStripSnapshotSettings>;

export type CategorySpotlightSnapshotSection = HomepageSectionBase<
  'CATEGORY_SPOTLIGHT',
  CategorySpotlightSnapshotSettings
>;

export type ReadyToShipSnapshotSection = HomepageSectionBase<'READY_TO_SHIP', ReadyToShipSettings>;

export type ProductRailSnapshotSection = HomepageSectionBase<'PRODUCT_RAIL', ProductRailSnapshotSettings>;

export type BrandShowcaseSnapshotSection = HomepageSectionBase<'BRAND_SHOWCASE', BrandShowcaseSnapshotSettings>;

export type BlogFeatureSnapshotSection = HomepageSectionBase<'BLOG_FEATURE', BlogFeatureSettings>;

export type HomepageSnapshotSection =
  | HeroCarouselSnapshotSection
  | TrustStripSnapshotSection
  | CategoryDiscoverySnapshotSection
  | OfferStripSnapshotSection
  | CategorySpotlightSnapshotSection
  | ReadyToShipSnapshotSection
  | ProductRailSnapshotSection
  | BrandShowcaseSnapshotSection
  | BlogFeatureSnapshotSection;

export interface HomepageSnapshot {
  schemaVersion: number;
  sections: HomepageSnapshotSection[];
}

export type HomepagePublicationStatus =
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export interface HomepagePublicationSummaryDto {
  id: string;
  version: number;
  status: HomepagePublicationStatus;
  publishAt: string | null;
  publishedAt: string | null;
  sourceDraftRevision: number;
  /** Source publication for a rollback-created version. */
  rollbackFromPublicationId: string | null;
  note: string | null;
  createdBy: string | null;
  publishedBy: string | null;
  createdAt: string;
}

export interface HomepagePublicationDto
  extends HomepagePublicationSummaryDto {
  schemaVersion: number;
  sections: HomepageSnapshotSection[];
}

export type HomepageValidationSeverity = 'ERROR' | 'WARNING';

export type HomepageValidationCategory =
  | 'STRUCTURAL'
  | 'MISSING_REFERENCE'
  | 'INELIGIBLE_REFERENCE'
  | 'WARNING';

/** Stable, form-mappable validation issue for draft/snapshot checks. */
export interface HomepageValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: HomepageValidationSeverity;
  category: HomepageValidationCategory;
}

export interface HomepageDraftValidationResult {
  revision: number;
  schemaVersion: number;
  valid: boolean;
  errors: HomepageValidationIssue[];
  warnings: HomepageValidationIssue[];
}

export interface UpdateHomepageDraftInput {
  revision: number;
  schemaVersion?: number;
  sections: HomepageDraftSection[];
}

export interface ValidateHomepageDraftInput {
  revision?: number;
  schemaVersion?: number;
  sections?: HomepageDraftSection[];
}

export interface HomepagePublicationListQuery {
  page?: number;
  limit?: number;
  status?: HomepagePublicationStatus;
}

export type HomepagePublicationListResponse =
  PaginatedResult<HomepagePublicationSummaryDto>;

export interface CreateHomepagePublicationInput {
  /** Absent/null publishes immediately. A future ISO timestamp schedules it. */
  publishAt?: string | null;
  note?: string | null;
}

export interface RollbackHomepagePublicationInput {
  note?: string | null;
}

// ---------------------------------------------------------------------------
// Public resolved DTO foundations
// ---------------------------------------------------------------------------

export interface PublishedCategoryTile
  extends Pick<
    CatalogCategoryNode,
    'id' | 'name' | 'slug' | 'publishedProductCount'
  > {
  coverUrl: string | null;
}

export interface PublishedCampaignCopy {
  campaignType: MerchCampaignType;
  eyebrowFa: string | null;
  titleFa: string | null;
  subtitleFa: string | null;
  ctaLabelFa: string | null;
  /** Frozen typed CTA; `href` is null when the target is no longer public. */
  cta: MerchCtaTarget;
  href: string | null;
}

export interface PublishedHeroSlide {
  campaignType: MerchCampaignType;
  eyebrowFa: string | null;
  titleFa: string;
  subtitleFa: string | null;
  ctaLabel: string | null;
  /** Frozen typed CTA; `href` is null when the target is no longer public. */
  cta: MerchCtaTarget;
  href: string | null;
  desktopImageUrl: string | null;
  mobileImageUrl: string | null;
  focalX: number;
  focalY: number;
  altFa: string | null;
  /** Category/product-derived fallback images for campaigns without uploads. */
  images: string[];
}

interface PublishedSectionBase<TType extends HomepageSectionType> {
  key: string;
  type: TType;
  order: number;
}

export interface PublishedHeroCarouselSection
  extends PublishedSectionBase<'HERO_CAROUSEL'> {
  slides: PublishedHeroSlide[];
}

export interface PublishedTrustStripSection
  extends PublishedSectionBase<'TRUST_STRIP'> {
  items: MerchTrustItem[];
}

export interface PublishedCategoryDiscoverySection
  extends PublishedSectionBase<'CATEGORY_DISCOVERY'> {
  categories: PublishedCategoryTile[];
}

export interface PublishedOfferStripSection
  extends PublishedSectionBase<'OFFER_STRIP'> {
  products: CatalogProductCardDto[];
  mode: 'offer' | 'featured';
  endsAt: string | null;
  copy: PublishedCampaignCopy;
}

export interface PublishedCategorySpotlightSection
  extends PublishedSectionBase<'CATEGORY_SPOTLIGHT'> {
  category: PublishedCategoryTile;
  secondaryCount: number | null;
  copy: PublishedCampaignCopy;
}

export interface PublishedReadyToShipSection
  extends PublishedSectionBase<'READY_TO_SHIP'> {
  products: CatalogProductCardDto[];
  title: string | null;
  subtitle: string | null;
}

export interface PublishedProductRailSection
  extends PublishedSectionBase<'PRODUCT_RAIL'> {
  title: string;
  subtitle: string | null;
  actionHref: string | null;
  products: CatalogProductCardDto[];
}

export interface PublishedBrandShowcaseSection
  extends PublishedSectionBase<'BRAND_SHOWCASE'> {
  groups: Array<{
    brand: CatalogRefDto;
    products: CatalogProductCardDto[];
  }>;
}

export interface PublishedBlogFeatureSection
  extends PublishedSectionBase<'BLOG_FEATURE'> {
  posts: BlogPostCardDto[];
}

export type PublishedHomepageSection =
  | PublishedHeroCarouselSection
  | PublishedTrustStripSection
  | PublishedCategoryDiscoverySection
  | PublishedOfferStripSection
  | PublishedCategorySpotlightSection
  | PublishedReadyToShipSection
  | PublishedProductRailSection
  | PublishedBrandShowcaseSection
  | PublishedBlogFeatureSection;

export interface PublishedHomepageDto {
  /** Null when no PUBLISHED homepage exists (deterministic empty response). */
  version: number | null;
  schemaVersion: number | null;
  publishedAt: string | null;
  sections: PublishedHomepageSection[];
}
