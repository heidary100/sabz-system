import type {
  MerchCampaignScheduleStatus,
  MerchCampaignType,
  MerchCtaKind,
  MerchMediaSlot,
  MerchTrustIcon,
} from '@sabz/types'
import {
  MERCH_CAMPAIGN_TYPES,
  MERCH_CTA_KINDS,
  MERCH_MEDIA_SLOTS,
  MERCH_TRUST_ICONS,
} from '@sabz/types'

export const MERCH_CAMPAIGN_TYPE_LABELS: Record<MerchCampaignType, string> = {
  SEASONAL: 'فصلی',
  DISCOUNT: 'تخفیفی',
  BRAND: 'برندی',
  CATEGORY: 'دسته‌بندی',
  NEW_ARRIVAL: 'تازه‌ها',
  CLEARANCE: 'فروش ویژه',
  EDITORIAL: 'تحریریه',
}

export const MERCH_CTA_KIND_LABELS: Record<MerchCtaKind, string> = {
  NONE: 'بدون فراخوان',
  ALL_PRODUCTS: 'همه محصولات',
  PRODUCT: 'محصول مشخص',
  CATEGORY: 'دسته‌بندی مشخص',
  BRAND: 'برند مشخص',
  NEW_ARRIVALS: 'تازه‌ها',
}

export const MERCH_MEDIA_SLOT_LABELS: Record<MerchMediaSlot, string> = {
  HERO_DESKTOP: 'هدر دسکتاپ',
  HERO_MOBILE: 'هدر موبایل',
  BANNER: 'بنر',
  EDITORIAL: 'تصویر تحریریه',
}

export const MERCH_CAMPAIGN_SCHEDULE_STATUS_LABELS: Record<
  MerchCampaignScheduleStatus,
  string
> = {
  UNSCHEDULED: 'بدون بازه زمانی',
  SCHEDULED: 'در انتظار شروع',
  ACTIVE: 'در بازه فعال',
  EXPIRED: 'پایان‌یافته',
}

export const MERCH_TRUST_ICON_LABELS: Record<MerchTrustIcon, string> = {
  shield: 'تضمین',
  truck: 'ارسال',
  badge: 'نشان اعتماد',
  support: 'پشتیبانی',
}

export const MERCH_CAMPAIGN_TYPE_ORDER: readonly MerchCampaignType[] =
  MERCH_CAMPAIGN_TYPES
export const MERCH_CTA_KIND_ORDER: readonly MerchCtaKind[] = MERCH_CTA_KINDS
export const MERCH_MEDIA_SLOT_ORDER: readonly MerchMediaSlot[] = MERCH_MEDIA_SLOTS
export const MERCH_TRUST_ICON_ORDER: readonly MerchTrustIcon[] =
  MERCH_TRUST_ICONS

export function campaignTypeLabel(type: MerchCampaignType): string {
  return MERCH_CAMPAIGN_TYPE_LABELS[type]
}

export function ctaKindLabel(kind: MerchCtaKind): string {
  return MERCH_CTA_KIND_LABELS[kind]
}

export function mediaSlotLabel(slot: MerchMediaSlot): string {
  return MERCH_MEDIA_SLOT_LABELS[slot]
}
