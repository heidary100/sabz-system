import type {
  HomepagePublicationStatus,
  MerchCampaignStatus,
  MerchMediaStatus,
} from '@sabz/types'
import type { StatusTone } from './status-tones'

/**
 * Merchandising status presentation (SS-273).
 *
 * These maps only translate stored/derived backend states. They deliberately
 * do not infer why a publication was cancelled: `CANCELLED` covers both an
 * operator cancellation and a system activation block, and only audit evidence
 * on the publication detail may distinguish the two.
 */

export const MERCH_CAMPAIGN_STATUS_LABELS: Record<MerchCampaignStatus, string> = {
  DRAFT: 'پیش‌نویس',
  DISABLED: 'غیرفعال',
  SCHEDULED: 'زمان‌بندی‌شده',
  ACTIVE_WINDOW: 'در بازه فعال',
  EXPIRED: 'پایان‌یافته',
  ARCHIVED: 'بایگانی‌شده',
}

export const MERCH_CAMPAIGN_STATUS_TONES: Record<MerchCampaignStatus, StatusTone> = {
  DRAFT: 'neutral',
  DISABLED: 'neutral',
  SCHEDULED: 'info',
  ACTIVE_WINDOW: 'success',
  EXPIRED: 'neutral',
  ARCHIVED: 'neutral',
}

export const MERCH_MEDIA_STATUS_LABELS: Record<MerchMediaStatus, string> = {
  DRAFT: 'منتشرنشده',
  PUBLISHED: 'منتشرشده',
}

export const MERCH_MEDIA_STATUS_TONES: Record<MerchMediaStatus, StatusTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
}

export const HOMEPAGE_PUBLICATION_STATUS_LABELS: Record<
  HomepagePublicationStatus,
  string
> = {
  SCHEDULED: 'زمان‌بندی‌شده',
  PUBLISHED: 'منتشرشده',
  SUPERSEDED: 'جایگزین‌شده',
  CANCELLED: 'لغوشده',
}

export const HOMEPAGE_PUBLICATION_STATUS_TONES: Record<
  HomepagePublicationStatus,
  StatusTone
> = {
  SCHEDULED: 'info',
  PUBLISHED: 'success',
  SUPERSEDED: 'neutral',
  // Never danger: a cancelled publication is not proof of a system failure.
  CANCELLED: 'neutral',
}

export function merchCampaignStatusLabel(status: MerchCampaignStatus): string {
  return MERCH_CAMPAIGN_STATUS_LABELS[status]
}

export function merchCampaignStatusTone(status: MerchCampaignStatus): StatusTone {
  return MERCH_CAMPAIGN_STATUS_TONES[status]
}

export function merchMediaStatusLabel(status: MerchMediaStatus): string {
  return MERCH_MEDIA_STATUS_LABELS[status]
}

export function merchMediaStatusTone(status: MerchMediaStatus): StatusTone {
  return MERCH_MEDIA_STATUS_TONES[status]
}

export function homepagePublicationStatusLabel(
  status: HomepagePublicationStatus,
): string {
  return HOMEPAGE_PUBLICATION_STATUS_LABELS[status]
}

export function homepagePublicationStatusTone(
  status: HomepagePublicationStatus,
): StatusTone {
  return HOMEPAGE_PUBLICATION_STATUS_TONES[status]
}
