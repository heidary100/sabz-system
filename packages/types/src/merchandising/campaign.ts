import type { PaginatedResult } from '../api/pagination';

/**
 * Admin merchandising campaign contracts (Task 05.1).
 *
 * Campaigns are reusable source content. They become public only when a
 * HomepagePublication snapshot references them; draft edits never mutate a
 * published snapshot. Prices, inventory, promotion state, and catalog
 * visibility stay in the existing catalog/pricing domains.
 */

export const MERCH_CAMPAIGN_TYPES = [
  'SEASONAL',
  'DISCOUNT',
  'BRAND',
  'CATEGORY',
  'NEW_ARRIVAL',
  'CLEARANCE',
  'EDITORIAL',
] as const;

export type MerchCampaignType = (typeof MERCH_CAMPAIGN_TYPES)[number];

export const MERCH_CTA_KINDS = [
  'NONE',
  'ALL_PRODUCTS',
  'PRODUCT',
  'CATEGORY',
  'BRAND',
  'NEW_ARRIVALS',
] as const;

export type MerchCtaKind = (typeof MERCH_CTA_KINDS)[number];

export const MERCH_MEDIA_SLOTS = [
  'HERO_DESKTOP',
  'HERO_MOBILE',
  'BANNER',
  'EDITORIAL',
] as const;

export type MerchMediaSlot = (typeof MERCH_MEDIA_SLOTS)[number];

/**
 * Derived admin presentation status. Only `archivedAt`, `isEnabled`, and the
 * schedule fields are stored; publication usage is exposed separately and is
 * never folded into this value.
 */
export type MerchCampaignStatus =
  | 'DRAFT'
  | 'DISABLED'
  | 'SCHEDULED'
  | 'ACTIVE_WINDOW'
  | 'EXPIRED'
  | 'ARCHIVED';

/** Schedule-window meaning independent from enabled/archive/publication state. */
export type MerchCampaignScheduleStatus =
  | 'UNSCHEDULED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'EXPIRED';

export type MerchCtaTarget =
  | { kind: 'NONE' }
  | { kind: 'ALL_PRODUCTS' }
  | { kind: 'NEW_ARRIVALS' }
  | { kind: 'PRODUCT'; productId: string }
  | { kind: 'CATEGORY'; categoryId: string }
  | { kind: 'BRAND'; brandId: string };

export interface MerchCampaignProductRef {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface MerchCampaignCategoryRef {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface MerchCampaignBrandRef {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

/** One media assignment as returned to an operator (no public URL/storage key). */
export interface MerchCampaignMediaRef {
  id: string;
  mediaId: string;
  originalName: string;
  mimeType: string;
  slot: MerchMediaSlot;
  altFa: string | null;
  focalX: number;
  focalY: number;
  sortOrder: number;
  publishedAt: string | null;
}

/**
 * Media reference frozen into a publication snapshot. URLs are resolved by the
 * public resolver from the media row; storage keys never enter the contract.
 */
export interface MerchCampaignMediaSnapshot {
  mediaId: string;
  slot: MerchMediaSlot;
  altFa: string | null;
  focalX: number;
  focalY: number;
  sortOrder: number;
}

/**
 * Campaign display content frozen at publication time. Product/category/brand
 * IDs remain references so authoritative visibility, prices, stock, and
 * promotions are resolved live by the public API.
 */
export interface MerchCampaignSnapshot {
  sourceCampaignId: string;
  type: MerchCampaignType;
  titleFa: string;
  eyebrowFa: string | null;
  subtitleFa: string | null;
  descriptionFa: string | null;
  ctaLabelFa: string | null;
  cta: MerchCtaTarget;
  productIds: string[];
  categoryIds: string[];
  brandIds: string[];
  media: MerchCampaignMediaSnapshot[];
  startsAt: string | null;
  endsAt: string | null;
}

export interface MerchCampaignPublicationUsageDto {
  id: string;
  version: number;
  status: 'PUBLISHED' | 'SCHEDULED';
  publishAt: string | null;
  publishedAt: string | null;
}

export interface MerchCampaignUsageDto {
  currentPublications: MerchCampaignPublicationUsageDto[];
  scheduledPublications: MerchCampaignPublicationUsageDto[];
}

export interface MerchCampaignSummaryDto {
  id: string;
  internalName: string;
  type: MerchCampaignType;
  titleFa: string;
  /** Presentation convenience only; never means the campaign is public. */
  status: MerchCampaignStatus;
  scheduleStatus: MerchCampaignScheduleStatus;
  isEnabled: boolean;
  isArchived: boolean;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  archivedAt: string | null;
  updatedAt: string;
}

export interface MerchCampaignDto extends MerchCampaignSummaryDto {
  eyebrowFa: string | null;
  subtitleFa: string | null;
  descriptionFa: string | null;
  ctaLabelFa: string | null;
  cta: MerchCtaTarget;
  products: MerchCampaignProductRef[];
  categories: MerchCampaignCategoryRef[];
  brands: MerchCampaignBrandRef[];
  media: MerchCampaignMediaRef[];
  usage: MerchCampaignUsageDto;
  /**
   * Best-effort comparison against matching published/scheduled snapshots.
   * Null when no snapshot references the campaign and dirty state cannot be
   * claimed reliably.
   */
  hasUnpublishedChanges: boolean | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
}

export interface MerchCampaignMediaAssignmentInput {
  mediaId: string;
  slot: MerchMediaSlot;
  focalX?: number;
  focalY?: number;
  altFa?: string | null;
}

export interface CreateMerchCampaignInput {
  internalName: string;
  type: MerchCampaignType;
  titleFa: string;
  eyebrowFa?: string | null;
  subtitleFa?: string | null;
  descriptionFa?: string | null;
  ctaLabelFa?: string | null;
  cta?: MerchCtaTarget;
  isEnabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
  productIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  media?: MerchCampaignMediaAssignmentInput[];
}

export interface UpdateMerchCampaignInput {
  internalName?: string;
  type?: MerchCampaignType;
  titleFa?: string;
  eyebrowFa?: string | null;
  subtitleFa?: string | null;
  descriptionFa?: string | null;
  ctaLabelFa?: string | null;
  cta?: MerchCtaTarget;
  isEnabled?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  priority?: number;
  productIds?: string[];
  categoryIds?: string[];
  brandIds?: string[];
  media?: MerchCampaignMediaAssignmentInput[];
}

export interface MerchCampaignListQuery {
  page?: number;
  limit?: number;
  q?: string;
  type?: MerchCampaignType;
  isEnabled?: boolean;
  isArchived?: boolean;
}

export type MerchCampaignListResponse = PaginatedResult<MerchCampaignSummaryDto>;
