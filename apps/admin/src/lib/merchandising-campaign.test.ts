import { afterEach, describe, expect, it } from 'vitest'
import type { MerchCampaignDto } from '@sabz/types'
import {
  EMPTY_CAMPAIGN_FORM,
  buildCampaignCreateInput,
  buildCampaignUpdate,
  campaignFormFromDetail,
  campaignFormHasErrors,
  ctaTargetFromForm,
  hasCampaignUpdates,
  validateCampaignForm,
  type CampaignFormState,
} from './merchandising-campaign'

const detail: MerchCampaignDto = {
  id: 'campaign-1',
  internalName: 'کمپین پاییز',
  type: 'SEASONAL',
  titleFa: 'پاییز گرم',
  eyebrowFa: 'جدید',
  subtitleFa: 'زیرعنوان',
  descriptionFa: 'توضیح',
  ctaLabelFa: 'مشاهده',
  cta: { kind: 'PRODUCT', productId: 'product-1' },
  isEnabled: true,
  startsAt: '2026-11-09T10:00:00.000Z',
  endsAt: '2026-11-10T10:00:00.000Z',
  priority: 5,
  status: 'ACTIVE_WINDOW',
  scheduleStatus: 'ACTIVE',
  isArchived: false,
  archivedAt: null,
  updatedAt: '2026-11-09T10:00:00.000Z',
  products: [
    { id: 'product-1', name: 'محصول یک', slug: 'product-1', sortOrder: 0 },
  ],
  categories: [
    { id: 'category-1', name: 'دسته یک', slug: 'category-1', sortOrder: 0 },
  ],
  brands: [
    { id: 'brand-1', name: 'برند یک', slug: 'brand-1', sortOrder: 0 },
  ],
  media: [
    {
      id: 'assignment-1',
      mediaId: 'media-1',
      originalName: 'hero.png',
      mimeType: 'image/png',
      slot: 'HERO_DESKTOP',
      altFa: 'تصویر هدر',
      focalX: 50,
      focalY: 40,
      sortOrder: 0,
      publishedAt: null,
    },
  ],
  usage: { currentPublications: [], scheduledPublications: [] },
  hasUnpublishedChanges: null,
  createdBy: null,
  updatedBy: null,
  createdAt: '2026-11-09T10:00:00.000Z',
}

function form(): CampaignFormState {
  return campaignFormFromDetail(detail)
}

const originalTimeZone = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTimeZone
})

describe('campaign form model (SS-275)', () => {
  it('maps detail data into an editable form and preserves association order', () => {
    const value = form()

    expect(value.productIds).toEqual(['product-1'])
    expect(value.categoryIds).toEqual(['category-1'])
    expect(value.brandIds).toEqual(['brand-1'])
    expect(value.media[0]).toMatchObject({
      mediaId: 'media-1',
      slot: 'HERO_DESKTOP',
      focalX: '50',
      focalY: '40',
      altFa: 'تصویر هدر',
    })
    expect(value.ctaKind).toBe('PRODUCT')
    expect(value.ctaProductId).toBe('product-1')
  })

  it('maps stored campaign timestamps to Tehran wall time', () => {
    const value = form()
    expect(value.startsAt).toBe('2026-11-09T13:30')
    expect(value.endsAt).toBe('2026-11-10T13:30')
  })

  it.each(['UTC', 'America/New_York', 'Asia/Tokyo'])(
    'serializes the same Tehran campaign wall time regardless of process timezone (%s)',
    (timeZone) => {
      process.env.TZ = timeZone
      const input = buildCampaignCreateInput({
        ...EMPTY_CAMPAIGN_FORM,
        internalName: 'کمپین',
        titleFa: 'عنوان',
        startsAt: '2026-11-10T12:00',
        endsAt: '2026-11-10T13:30',
        ctaKind: 'NONE',
        priority: '0',
      })
      expect(input.startsAt).toBe('2026-11-10T08:30:00.000Z')
      expect(input.endsAt).toBe('2026-11-10T10:00:00.000Z')
    },
  )

  it('keeps empty campaign dates null and rejects impossible Tehran dates', () => {
    const input = buildCampaignCreateInput({
      ...EMPTY_CAMPAIGN_FORM,
      internalName: 'کمپین',
      titleFa: 'عنوان',
      ctaKind: 'NONE',
      priority: '0',
    })
    expect(input.startsAt).toBeNull()
    expect(input.endsAt).toBeNull()

    const errors = validateCampaignForm({
      ...EMPTY_CAMPAIGN_FORM,
      internalName: 'کمپین',
      titleFa: 'عنوان',
      ctaKind: 'NONE',
      priority: '0',
      startsAt: '2026-02-30T10:00',
    })
    expect(errors.startsAt).toBe('زمان شروع معتبر نیست.')
  })

  it('sends only changed campaign dates as Tehran-converted UTC in PATCH bodies', () => {
    const initial = form()
    expect(buildCampaignUpdate(initial, initial)).toEqual({})

    const updated = buildCampaignUpdate(initial, {
      ...initial,
      startsAt: '2026-11-09T14:00',
    })
    expect(updated).toEqual({ startsAt: '2026-11-09T10:30:00.000Z' })
  })

  it('builds a partial update containing only changed fields', () => {
    const initial = form()
    const current = { ...initial, titleFa: 'عنوان تازه' }

    expect(buildCampaignUpdate(initial, current)).toEqual({
      titleFa: 'عنوان تازه',
    })
    expect(hasCampaignUpdates(initial, current)).toBe(true)
  })

  it('sends ordered selection arrays when their order changes', () => {
    const initial = {
      ...form(),
      productIds: ['p1', 'p2'],
      categoryIds: ['c1'],
      brandIds: ['b1', 'b2'],
    }
    const current = {
      ...initial,
      productIds: ['p2', 'p1'],
      brandIds: ['b2', 'b1'],
    }

    expect(buildCampaignUpdate(initial, current)).toEqual({
      productIds: ['p2', 'p1'],
      brandIds: ['b2', 'b1'],
    })
  })

  it('maps assignment focal/alt edits without touching media-library alt', () => {
    const initial = form()
    const current = {
      ...initial,
      media: initial.media.map((item) => ({
        ...item,
        altFa: 'متن تخصیص',
        focalX: '20',
        focalY: '80',
      })),
    }

    expect(buildCampaignUpdate(initial, current)).toEqual({
      media: [
        {
          mediaId: 'media-1',
          slot: 'HERO_DESKTOP',
          focalX: 20,
          focalY: 80,
          altFa: 'متن تخصیص',
        },
      ],
    })
  })

  it('builds a supported create payload', () => {
    const input = buildCampaignCreateInput({
      ...EMPTY_CAMPAIGN_FORM,
      internalName: 'کمپین',
      titleFa: 'عنوان',
      ctaKind: 'CATEGORY',
      ctaCategoryId: 'category-1',
      ctaLabelFa: 'مشاهده',
      priority: '10',
    })

    expect(input).toMatchObject({
      internalName: 'کمپین',
      type: 'SEASONAL',
      titleFa: 'عنوان',
      cta: { kind: 'CATEGORY', categoryId: 'category-1' },
      ctaLabelFa: 'مشاهده',
      priority: 10,
      isEnabled: true,
    })
    expect(input).not.toHaveProperty('productIds')
    expect(input).not.toHaveProperty('media')
  })

  it('maps every CTA kind to the typed target union', () => {
    expect(
      ctaTargetFromForm({
        ...form(),
        ctaKind: 'PRODUCT',
        ctaProductId: 'p1',
      }),
    ).toEqual({ kind: 'PRODUCT', productId: 'p1' })
    expect(
      ctaTargetFromForm({
        ...form(),
        ctaKind: 'CATEGORY',
        ctaCategoryId: 'c1',
      }),
    ).toEqual({ kind: 'CATEGORY', categoryId: 'c1' })
    expect(
      ctaTargetFromForm({
        ...form(),
        ctaKind: 'BRAND',
        ctaBrandId: 'b1',
      }),
    ).toEqual({ kind: 'BRAND', brandId: 'b1' })
    expect(ctaTargetFromForm({ ...form(), ctaKind: 'NONE' })).toEqual({
      kind: 'NONE',
    })
  })
})

describe('campaign form validation (SS-275)', () => {
  it('requires core fields and a CTA target/label', () => {
    const errors = validateCampaignForm({
      ...EMPTY_CAMPAIGN_FORM,
      ctaKind: 'PRODUCT',
    })

    expect(campaignFormHasErrors(errors)).toBe(true)
    expect(errors.internalName).toBeTruthy()
    expect(errors.titleFa).toBeTruthy()
    expect(errors.cta).toBeTruthy()
    expect(errors.ctaLabelFa).toBeTruthy()
  })

  it('rejects an invalid schedule window and priority', () => {
    const errors = validateCampaignForm({
      ...form(),
      startsAt: '2026-11-10T12:00',
      endsAt: '2026-11-10T10:00',
      priority: '-1',
    })

    expect(errors.endsAt).toContain('بعد از زمان شروع')
    expect(errors.priority).toBeTruthy()
  })

  it('enforces association limits and duplicates', () => {
    const errors = validateCampaignForm({
      ...form(),
      productIds: Array.from({ length: 13 }, (_, index) => `p${index}`),
      categoryIds: ['c1', 'c1'],
      brandIds: Array.from({ length: 6 }, (_, index) => `b${index}`),
    })

    expect(errors.products).toContain('۱۲')
    expect(errors.categories).toContain('تکراری')
    expect(errors.brands).toContain('۵')
  })

  it('validates media slot, focal bounds, duplicates, and alt length', () => {
    const errors = validateCampaignForm({
      ...form(),
      media: [
        {
          mediaId: 'media-1',
          originalName: 'hero.png',
          mimeType: 'image/png',
          publishedAt: null,
          slot: 'HERO_DESKTOP',
          altFa: 'x'.repeat(161),
          focalX: '101',
          focalY: '50',
        },
        {
          mediaId: 'media-1',
          originalName: 'hero.png',
          mimeType: 'image/png',
          publishedAt: null,
          slot: 'HERO_DESKTOP',
          altFa: '',
          focalX: '50',
          focalY: '50',
        },
      ],
    })

    expect(errors.mediaItems?.['0']?.altFa).toContain('۱۶۰')
    expect(errors.mediaItems?.['0']?.focalX).toContain('۰ تا ۱۰۰')
    expect(errors.mediaItems?.['1']?.slot).toContain('قبلاً انتخاب شده')
  })
})
