// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HomepageDraftSection,
  MerchCampaignBrandRef,
  MerchCampaignCategoryRef,
  MerchCampaignDto,
} from '@sabz/types'
import { MemoryRouter } from 'react-router-dom'
import { HomepageCampaignSectionCreateDialog } from './homepage-campaign-section-create-dialog'

const detailsState = vi.hoisted(() => ({
  details: {} as Record<string, MerchCampaignDto>,
  loading: {} as Record<string, boolean>,
  errors: {} as Record<string, string>,
}))

vi.mock('../../../hooks/use-merch-campaign-details', () => ({
  useMerchCampaignDetails: () => detailsState,
}))

function category(id: string, name: string): MerchCampaignCategoryRef {
  return { id, name, slug: id, sortOrder: 0 }
}
function brand(id: string, name: string): MerchCampaignBrandRef {
  return { id, name, slug: id, sortOrder: 0 }
}
function campaign(overrides: Partial<MerchCampaignDto> = {}): MerchCampaignDto {
  return {
    id: 'campaign-a',
    internalName: 'کمپین الف',
    type: 'SEASONAL',
    titleFa: 'پیشنهاد پاییز',
    eyebrowFa: null,
    subtitleFa: null,
    descriptionFa: null,
    ctaLabelFa: null,
    cta: { kind: 'NONE' },
    isEnabled: true,
    startsAt: null,
    endsAt: null,
    priority: 0,
    status: 'ACTIVE_WINDOW',
    scheduleStatus: 'ACTIVE',
    isArchived: false,
    archivedAt: null,
    updatedAt: '2026-11-09T10:00:00.000Z',
    products: [],
    categories: [category('cat-1', 'دسته یک')],
    brands: [brand('brand-1', 'برند یک')],
    media: [],
    usage: { currentPublications: [], scheduledPublications: [] },
    hasUnpublishedChanges: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-11-09T10:00:00.000Z',
    ...overrides,
  }
}

const valid = campaign()
const noCategories = campaign({ id: 'campaign-no-cats', categories: [] })
const noBrands = campaign({ id: 'campaign-no-brands', brands: [] })

function renderDialog(
  type: Parameters<typeof HomepageCampaignSectionCreateDialog>[0]['type'],
  campaignId: string,
  onCreate: (
    settings: HomepageDraftSection['settings'],
  ) => string | null = vi.fn(() => null),
) {
  render(
    <MemoryRouter>
      <HomepageCampaignSectionCreateDialog
        open
        type={type}
        campaignId={campaignId}
        onClose={() => {}}
        onCreate={onCreate}
      />
    </MemoryRouter>,
  )
  return onCreate
}

describe('HomepageCampaignSectionCreateDialog (SS-278)', () => {
  beforeEach(() => {
    detailsState.details = {
      [valid.id]: valid,
      [noCategories.id]: noCategories,
      [noBrands.id]: noBrands,
    }
    detailsState.loading = {}
    detailsState.errors = {}
  })

  afterEach(cleanup)

  it('creates Hero with one selected campaign', () => {
    const onCreate = renderDialog('HERO_CAROUSEL', valid.id)
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد بخش' }))
    expect(onCreate).toHaveBeenCalledWith({ campaignIds: [valid.id] })
  })

  it('creates Offer with the schema default fallback', () => {
    const onCreate = renderDialog('OFFER_STRIP', valid.id)
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد بخش' }))
    expect(onCreate).toHaveBeenCalledWith({
      campaignId: valid.id,
      fallback: 'featured',
    })
  })

  it('requires campaign categories for Category Discovery', () => {
    renderDialog('CATEGORY_DISCOVERY', noCategories.id)
    expect(screen.getByText(/باید بین ۱ تا ۶ دسته‌بندی داشته باشد/)).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'ایجاد بخش',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('requires a primary category for Category Spotlight', () => {
    const onCreate = renderDialog('CATEGORY_SPOTLIGHT', valid.id)
    expect(
      (
        screen.getByRole('button', {
          name: 'ایجاد بخش',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('دسته‌بندی اصلی'), {
      target: { value: 'cat-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد بخش' }))
    expect(onCreate).toHaveBeenCalledWith({
      campaignId: valid.id,
      categoryId: 'cat-1',
      secondaryCategoryId: null,
    })
  })

  it('creates Brand Showcase only with 1–5 campaign brands', () => {
    const onCreate = renderDialog('BRAND_SHOWCASE', valid.id)
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد بخش' }))
    expect(onCreate).toHaveBeenCalledWith({
      campaignId: valid.id,
      productsPerBrand: 3,
    })

    cleanup()
    renderDialog('BRAND_SHOWCASE', noBrands.id)
    expect(screen.getByText(/کمپین برندی ندارد/)).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'ایجاد بخش',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('shows insertion errors without closing or mutating anything itself', () => {
    const onCreate = renderDialog(
      'OFFER_STRIP',
      valid.id,
      vi.fn(() => 'خطای درج'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'ایجاد بخش' }))
    expect(screen.getByText('خطای درج')).toBeTruthy()
    expect(onCreate).toHaveBeenCalled()
  })
})
