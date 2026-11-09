import { describe, expect, it } from 'vitest'
import {
  MERCH_CAMPAIGN_SCHEDULE_STATUS_LABELS,
  MERCH_CAMPAIGN_TYPE_LABELS,
  MERCH_CTA_KIND_LABELS,
  MERCH_MEDIA_SLOT_LABELS,
  MERCH_TRUST_ICON_LABELS,
  campaignTypeLabel,
  ctaKindLabel,
  mediaSlotLabel,
} from './merchandising-labels'

describe('merchandising campaign labels (SS-275/SS-277)', () => {
  it('covers campaign types, CTA kinds, slots, schedule states, and trust icons', () => {
    expect(Object.keys(MERCH_CAMPAIGN_TYPE_LABELS)).toHaveLength(7)
    expect(Object.keys(MERCH_CTA_KIND_LABELS)).toHaveLength(6)
    expect(Object.keys(MERCH_MEDIA_SLOT_LABELS)).toHaveLength(4)
    expect(Object.keys(MERCH_CAMPAIGN_SCHEDULE_STATUS_LABELS)).toHaveLength(4)
    expect(Object.keys(MERCH_TRUST_ICON_LABELS)).toHaveLength(4)
    expect(campaignTypeLabel('SEASONAL')).toBe('فصلی')
    expect(ctaKindLabel('NEW_ARRIVALS')).toBe('تازه‌ها')
    expect(mediaSlotLabel('HERO_MOBILE')).toBe('هدر موبایل')
    expect(MERCH_TRUST_ICON_LABELS.support).toBe('پشتیبانی')
  })
})
