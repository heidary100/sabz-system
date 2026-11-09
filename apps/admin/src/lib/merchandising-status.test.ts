import { describe, expect, it } from 'vitest'
import {
  HOMEPAGE_PUBLICATION_STATUS_LABELS,
  HOMEPAGE_PUBLICATION_STATUS_TONES,
  MERCH_CAMPAIGN_STATUS_LABELS,
  MERCH_CAMPAIGN_STATUS_TONES,
  MERCH_MEDIA_STATUS_LABELS,
  MERCH_MEDIA_STATUS_TONES,
  homepagePublicationStatusLabel,
  homepagePublicationStatusTone,
  merchCampaignStatusLabel,
  merchCampaignStatusTone,
  merchMediaStatusLabel,
  merchMediaStatusTone,
} from './merchandising-status'

describe('merchandising status labels (SS-273)', () => {
  it('covers every campaign status without inventing public state', () => {
    expect(Object.keys(MERCH_CAMPAIGN_STATUS_LABELS).sort()).toEqual(
      ['ACTIVE_WINDOW', 'ARCHIVED', 'DISABLED', 'DRAFT', 'EXPIRED', 'SCHEDULED'],
    )
    expect(MERCH_CAMPAIGN_STATUS_LABELS.DRAFT).toBe('پیش‌نویس')
    expect(MERCH_CAMPAIGN_STATUS_LABELS.DISABLED).toBe('غیرفعال')
    expect(MERCH_CAMPAIGN_STATUS_LABELS.SCHEDULED).toBe('زمان‌بندی‌شده')
    expect(MERCH_CAMPAIGN_STATUS_LABELS.ACTIVE_WINDOW).toBe('در بازه فعال')
    expect(MERCH_CAMPAIGN_STATUS_LABELS.EXPIRED).toBe('پایان‌یافته')
    expect(MERCH_CAMPAIGN_STATUS_LABELS.ARCHIVED).toBe('بایگانی‌شده')
    expect(MERCH_CAMPAIGN_STATUS_TONES.ACTIVE_WINDOW).toBe('success')
    expect(merchCampaignStatusLabel('SCHEDULED')).toBe('زمان‌بندی‌شده')
    expect(merchCampaignStatusTone('DRAFT')).toBe('neutral')
  })

  it('labels media publication eligibility without implying upload publication', () => {
    expect(MERCH_MEDIA_STATUS_LABELS).toEqual({
      DRAFT: 'منتشرنشده',
      PUBLISHED: 'منتشرشده',
    })
    expect(MERCH_MEDIA_STATUS_TONES).toEqual({
      DRAFT: 'neutral',
      PUBLISHED: 'success',
    })
    expect(merchMediaStatusLabel('DRAFT')).toBe('منتشرنشده')
    expect(merchMediaStatusTone('PUBLISHED')).toBe('success')
  })

  it('covers all four publication statuses and keeps CANCELLED non-failure', () => {
    expect(Object.keys(HOMEPAGE_PUBLICATION_STATUS_LABELS).sort()).toEqual(
      ['CANCELLED', 'PUBLISHED', 'SCHEDULED', 'SUPERSEDED'],
    )
    expect(HOMEPAGE_PUBLICATION_STATUS_LABELS.SCHEDULED).toBe('زمان‌بندی‌شده')
    expect(HOMEPAGE_PUBLICATION_STATUS_LABELS.PUBLISHED).toBe('منتشرشده')
    expect(HOMEPAGE_PUBLICATION_STATUS_LABELS.SUPERSEDED).toBe('جایگزین‌شده')
    expect(HOMEPAGE_PUBLICATION_STATUS_LABELS.CANCELLED).toBe('لغوشده')
    // Audit evidence is required to distinguish operator cancellation from a
    // system block, so the generic status must never be styled as danger.
    expect(HOMEPAGE_PUBLICATION_STATUS_TONES.CANCELLED).toBe('neutral')
    expect(homepagePublicationStatusLabel('CANCELLED')).toBe('لغوشده')
    expect(homepagePublicationStatusTone('CANCELLED')).toBe('neutral')
  })
})
