// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CategorySpotlightSection,
  CategoryTreeNode,
  HeroCarouselSection,
  HomepageDraftSection,
  MerchCampaignCategoryRef,
  MerchCampaignDto,
  MerchCampaignMediaRef,
  TrustStripSection,
} from '@sabz/types'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { HeroCarouselSectionForm } from './hero-carousel-section-form'
import { TrustStripSectionForm } from './trust-strip-section-form'
import { CategoryDiscoverySectionForm } from './category-discovery-section-form'
import { OfferStripSectionForm } from './offer-strip-section-form'
import { CategorySpotlightSectionForm } from './category-spotlight-section-form'
import { HomepageSectionConfigPanel } from './homepage-section-config-panel'
import { getCategory } from '../../../services/categories'

const detailsState = vi.hoisted(() => ({
  details: {} as Record<string, MerchCampaignDto>,
  loading: {} as Record<string, boolean>,
  errors: {} as Record<string, string>,
}))
const pickedCampaign = vi.hoisted(() => ({ current: null as MerchCampaignDto | null }))
const pickedCategory = vi.hoisted(() => ({ current: null as CategoryTreeNode | null }))

vi.mock('../../../hooks/use-merch-campaign-details', () => ({
  useMerchCampaignDetails: () => detailsState,
}))
vi.mock('./homepage-campaign-picker-dialog', () => ({
  HomepageCampaignPickerDialog: ({
    open,
    onPick,
  }: {
    open: boolean
    onPick: (campaign: MerchCampaignDto) => void
  }) =>
    open && pickedCampaign.current ? (
      <button
        type="button"
        onClick={() => onPick(pickedCampaign.current!)}
      >
        انتخاب کمپین آزمایشی
      </button>
    ) : null,
}))
vi.mock('../../merchandising/campaigns/campaign-category-picker-dialog', () => ({
  CampaignCategoryPickerDialog: ({
    open,
    onPick,
  }: {
    open: boolean
    onPick: (category: CategoryTreeNode) => void
  }) =>
    open && pickedCategory.current ? (
      <button
        type="button"
        onClick={() => onPick(pickedCategory.current!)}
      >
        انتخاب دسته ثانویه آزمایشی
      </button>
    ) : null,
}))
vi.mock('../merch-media-thumbnail', () => ({
  MerchMediaThumbnail: ({ alt }: { alt: string }) => (
    <div data-testid="media-thumbnail">{alt}</div>
  ),
}))
vi.mock('../../../services/categories', () => ({ getCategory: vi.fn() }))

const mockGetCategory = vi.mocked(getCategory)

function category(
  id: string,
  name: string,
): MerchCampaignCategoryRef {
  return { id, name, slug: id, sortOrder: 0 }
}

function media(
  id: string,
  slot: MerchCampaignMediaRef['slot'],
): MerchCampaignMediaRef {
  return {
    id: `assignment-${id}`,
    mediaId: id,
    originalName: `${id}.png`,
    mimeType: 'image/png',
    slot,
    altFa: null,
    focalX: 50,
    focalY: 50,
    sortOrder: 0,
    publishedAt: null,
  }
}

function campaign(overrides: Partial<MerchCampaignDto> = {}): MerchCampaignDto {
  return {
    id: 'campaign-1',
    internalName: 'کمپین آزمایشی',
    type: 'SEASONAL',
    titleFa: 'پیشنهاد ویژه',
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
    categories: [],
    brands: [],
    media: [],
    usage: { currentPublications: [], scheduledPublications: [] },
    hasUnpublishedChanges: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-11-09T10:00:00.000Z',
    ...overrides,
  }
}

const campaignA = campaign({
  id: 'campaign-a',
  internalName: 'کمپین الف',
  titleFa: 'عنوان الف',
  categories: [category('cat-1', 'دسته یک'), category('cat-2', 'دسته دو')],
  media: [media('media-a-desktop', 'HERO_DESKTOP'), media('media-a-banner', 'BANNER')],
})
const campaignB = campaign({
  id: 'campaign-b',
  internalName: 'کمپین ب',
  titleFa: 'عنوان ب',
  categories: [category('cat-2', 'دسته دو'), category('cat-3', 'دسته سه')],
  media: [
    media('media-b-desktop', 'HERO_DESKTOP'),
    media('media-b-mobile', 'HERO_MOBILE'),
  ],
})
const campaignNoCategories = campaign({
  id: 'campaign-no-categories',
  internalName: 'کمپین بدون دسته',
  categories: [],
})
const campaignSevenCategories = campaign({
  id: 'campaign-seven-categories',
  internalName: 'کمپین هفت‌دسته',
  categories: Array.from({ length: 7 }, (_, index) =>
    category(`cat-seven-${index}`, `دسته ${index}`),
  ),
})

const basePath = 'sections[0].settings'

function renderWithRouter(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

function heroSection(campaignIds: string[]): HeroCarouselSection {
  return {
    key: 'hero-section',
    type: 'HERO_CAROUSEL',
    order: 0,
    isVisible: true,
    settings: { campaignIds },
  }
}

describe('campaign-backed homepage section forms (SS-277)', () => {
  beforeEach(() => {
    detailsState.details = {
      [campaignA.id]: campaignA,
      [campaignB.id]: campaignB,
      [campaignNoCategories.id]: campaignNoCategories,
      [campaignSevenCategories.id]: campaignSevenCategories,
    }
    detailsState.loading = {}
    detailsState.errors = {}
    pickedCampaign.current = campaignB
    pickedCategory.current = {
      id: 'cat-outside',
      name: 'دسته خارج از کمپین',
      slug: 'cat-outside',
      parentId: null,
      sortOrder: 0,
      isVisible: true,
      productCount: 1,
      children: [],
    }
    mockGetCategory.mockReset()
    mockGetCategory.mockResolvedValue({
      id: 'cat-outside',
      name: 'دسته خارج از کمپین',
      slug: 'cat-outside',
      parentId: null,
      sortOrder: 0,
      isVisible: true,
      children: [],
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('HERO: renders selected campaigns, media readiness, warnings, and ordering controls', () => {
    const onChange = vi.fn()
    renderWithRouter(
      <HeroCarouselSectionForm
        section={heroSection(['campaign-a', 'campaign-b'])}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )

    expect(screen.getByText('کمپین الف')).toBeTruthy()
    expect(screen.getByText('کمپین ب')).toBeTruthy()
    expect(screen.getAllByText('رسانه دسکتاپ موجود است')).toHaveLength(2)
    expect(screen.getByText('رسانه موبایل ندارد')).toBeTruthy()
    expect(screen.getByText(/نسخه دسکتاپ به‌عنوان جایگزین/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'جابه‌جایی کمپین ۱ به پایین' }),
    )
    expect(onChange).toHaveBeenCalledWith({
      campaignIds: ['campaign-b', 'campaign-a'],
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'حذف کمپین ۱' }),
    )
    expect(onChange).toHaveBeenCalledWith({ campaignIds: ['campaign-b'] })
  })

  it('HERO: shows desktop blocker and validation/media errors', () => {
    const noDesktop = campaign({
      id: 'campaign-no-desktop',
      internalName: 'کمپین بدون هدر',
      media: [media('only-banner', 'BANNER')],
    })
    detailsState.details = { [noDesktop.id]: noDesktop }
    renderWithRouter(
      <HeroCarouselSectionForm
        section={heroSection([noDesktop.id])}
        issues={[
          {
            path: `${basePath}.campaignIds[0].media`,
            code: 'HERO_DESKTOP_MEDIA_REQUIRED',
            message: 'برای اسلاید هیرو، رسانه HERO_DESKTOP الزامی است.',
            severity: 'ERROR',
            category: 'INELIGIBLE_REFERENCE',
          },
        ]}
        basePath={basePath}
        onSettingsChange={() => {}}
      />,
    )

    expect(screen.getByText('رسانه دسکتاپ ندارد')).toBeTruthy()
    expect(
      screen.getAllByText('برای اسلاید هیرو، رسانه HERO_DESKTOP الزامی است.')
        .length,
    ).toBeGreaterThan(0)
  })

  it('HERO: adds campaigns through the picker and enforces max/min', () => {
    const onChange = vi.fn()
    const { rerender } = renderWithRouter(
      <HeroCarouselSectionForm
        section={heroSection([])}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    expect(screen.getByText(/حداقل یک کمپین/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'افزودن کمپین' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب کمپین آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({ campaignIds: ['campaign-b'] })

    rerender(
      <MemoryRouter>
        <HeroCarouselSectionForm
          section={heroSection(['campaign-a', 'campaign-b', 'campaign-a'])}
          issues={[]}
          basePath={basePath}
          onSettingsChange={() => {}}
        />
      </MemoryRouter>,
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'افزودن کمپین',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('TRUST_STRIP: supports empty, add/remove, icon choices, limits, and field errors', () => {
    const onChange = vi.fn()
    const section: TrustStripSection = {
      key: 'trust-section',
      type: 'TRUST_STRIP',
      order: 0,
      isVisible: true,
      settings: { items: [] },
    }
    const { rerender } = renderWithRouter(
      <TrustStripSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    expect(screen.getByText(/نوار اعتماد خالی است/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'افزودن آیتم' }))
    expect(onChange).toHaveBeenCalledWith({
      items: [{ icon: 'shield', title: '', body: undefined }],
    })

    const fourItems = {
      ...section,
      settings: {
        items: Array.from({ length: 4 }, (_, index) => ({
          icon: 'shield' as const,
          title: `آیتم ${index}`,
        })),
      },
    }
    rerender(
      <MemoryRouter>
        <TrustStripSectionForm
          section={fourItems}
          issues={[
            {
              path: `${basePath}.items[0].title`,
              code: 'INVALID_STRING',
              message: 'عنوان الزامی است.',
              severity: 'ERROR',
              category: 'STRUCTURAL',
            },
          ]}
          basePath={basePath}
          onSettingsChange={() => {}}
        />
      </MemoryRouter>,
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'افزودن آیتم',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    const iconSelect = screen.getAllByLabelText('آیکن')[0] as HTMLSelectElement
    expect(iconSelect.options).toHaveLength(4)
    expect(
      (screen.getAllByLabelText('عنوان')[0] as HTMLInputElement).maxLength,
    ).toBe(120)
    expect(screen.getByText('عنوان الزامی است.')).toBeTruthy()
  })

  it('CATEGORY_DISCOVERY: shows campaign categories, empty state, and changes campaign', () => {
    const onChange = vi.fn()
    const section = {
      key: 'category-discovery',
      type: 'CATEGORY_DISCOVERY' as const,
      order: 0,
      isVisible: true,
      settings: { campaignId: campaignA.id },
    }
    const { rerender } = renderWithRouter(
      <CategoryDiscoverySectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    expect(screen.getByText('کمپین الف')).toBeTruthy()
    expect(screen.getByText('دسته یک')).toBeTruthy()
    expect(screen.getByText(/۲ دسته‌بندی/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'تغییر کمپین' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب کمپین آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({ campaignId: campaignB.id })

    rerender(
      <MemoryRouter>
        <CategoryDiscoverySectionForm
          section={{ ...section, settings: { campaignId: campaignNoCategories.id } }}
          issues={[]}
          basePath={basePath}
          onSettingsChange={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/این کمپین دسته‌بندی ندارد/)).toBeTruthy()
  })

  it('CATEGORY_DISCOVERY: rejects campaigns outside the 1–6 category range', () => {
    const section = {
      key: 'category-discovery',
      type: 'CATEGORY_DISCOVERY' as const,
      order: 0,
      isVisible: true,
      settings: { campaignId: campaignSevenCategories.id },
    }
    renderWithRouter(
      <CategoryDiscoverySectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={() => {}}
      />,
    )
    expect(screen.getByText(/۷ دسته‌بندی دارد/)).toBeTruthy()
    expect(
      screen.getAllByText(/باید بین ۱ تا ۶ دسته‌بندی/).length,
    ).toBeGreaterThan(0)
  })

  it('OFFER_STRIP: serializes both fallback enum values and changes campaign', () => {
    const onChange = vi.fn()
    const section = {
      key: 'offer',
      type: 'OFFER_STRIP' as const,
      order: 0,
      isVisible: true,
      settings: { campaignId: campaignA.id, fallback: 'featured' as const },
    }
    renderWithRouter(
      <OfferStripSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    expect(screen.getByText('کمپین الف')).toBeTruthy()
    const select = screen.getByLabelText('رفتار جایگزین')
    fireEvent.change(select, { target: { value: 'hide' } })
    expect(onChange).toHaveBeenCalledWith({
      campaignId: campaignA.id,
      fallback: 'hide',
    })

    fireEvent.click(screen.getByRole('button', { name: 'تغییر کمپین' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب کمپین آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({
      campaignId: campaignB.id,
      fallback: 'featured',
    })
  })

  it('CATEGORY_SPOTLIGHT: restricts primary options, clears on campaign change, and handles secondary', () => {
    const onChange = vi.fn()
    const section: CategorySpotlightSection = {
      key: 'spotlight',
      type: 'CATEGORY_SPOTLIGHT',
      order: 0,
      isVisible: true,
      settings: {
        campaignId: campaignA.id,
        categoryId: 'cat-1',
        secondaryCategoryId: null,
      },
    }
    const { rerender } = renderWithRouter(
      <CategorySpotlightSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    const primary = screen.getByLabelText('دسته‌بندی اصلی') as HTMLSelectElement
    expect(Array.from(primary.options).map((option) => option.value)).toEqual([
      '',
      'cat-1',
      'cat-2',
    ])
    fireEvent.change(primary, { target: { value: 'cat-2' } })
    expect(onChange).toHaveBeenCalledWith({
      campaignId: campaignA.id,
      categoryId: 'cat-2',
      secondaryCategoryId: null,
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'انتخاب دسته‌بندی ثانویه' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'انتخاب دسته ثانویه آزمایشی' }),
    )
    expect(onChange).toHaveBeenCalledWith({
      campaignId: campaignA.id,
      categoryId: 'cat-1',
      secondaryCategoryId: 'cat-outside',
    })

    fireEvent.click(screen.getByRole('button', { name: 'تغییر کمپین' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب کمپین آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({
      campaignId: campaignB.id,
      categoryId: '',
      secondaryCategoryId: null,
    })

    rerender(
      <MemoryRouter>
        <CategorySpotlightSectionForm
          section={{
            ...section,
            settings: {
              campaignId: campaignNoCategories.id,
              categoryId: '',
              secondaryCategoryId: null,
            },
          }}
          issues={[]}
          basePath={basePath}
          onSettingsChange={() => {}}
        />
      </MemoryRouter>,
    )
    expect(
      (screen.getByLabelText('دسته‌بندی اصلی') as HTMLSelectElement).disabled,
    ).toBe(true)
  })

  it('CATEGORY_SPOTLIGHT: prevents duplicate primary/secondary and shows field errors', () => {
    const section: CategorySpotlightSection = {
      key: 'spotlight',
      type: 'CATEGORY_SPOTLIGHT',
      order: 0,
      isVisible: true,
      settings: {
        campaignId: campaignA.id,
        categoryId: 'cat-1',
        secondaryCategoryId: 'cat-1',
      },
    }
    renderWithRouter(
      <CategorySpotlightSectionForm
        section={section}
        issues={[
          {
            path: `${basePath}.categoryId`,
            code: 'CATEGORY_NOT_IN_CAMPAIGN',
            message: 'دسته‌بندی اصلی باید در انتخاب‌های کمپین باشد.',
            severity: 'ERROR',
            category: 'INELIGIBLE_REFERENCE',
          },
        ]}
        basePath={basePath}
        onSettingsChange={() => {}}
      />,
    )
    expect(screen.getByText(/دسته‌بندی اصلی باید در انتخاب‌های کمپین باشد/)).toBeTruthy()
    expect(screen.getByText(/ثانویه باید با دسته‌بندی اصلی متفاوت باشد/)).toBeTruthy()
  })
})

describe('homepage config panel dispatch (SS-277)', () => {
  beforeEach(() => {
    detailsState.details = {
      [campaignA.id]: campaignA,
      [campaignB.id]: campaignB,
    }
    detailsState.loading = {}
    detailsState.errors = {}
  })

  afterEach(cleanup)

  it('renders the correct form for each implemented discriminant', () => {
    const sections: HomepageDraftSection[] = [
      heroSection([campaignA.id]),
      {
        key: 'trust',
        type: 'TRUST_STRIP',
        order: 1,
        isVisible: true,
        settings: { items: [] },
      },
      {
        key: 'discovery',
        type: 'CATEGORY_DISCOVERY',
        order: 2,
        isVisible: true,
        settings: { campaignId: campaignA.id },
      },
      {
        key: 'offer',
        type: 'OFFER_STRIP',
        order: 3,
        isVisible: true,
        settings: { campaignId: campaignA.id, fallback: 'featured' },
      },
      {
        key: 'spotlight',
        type: 'CATEGORY_SPOTLIGHT',
        order: 4,
        isVisible: true,
        settings: {
          campaignId: campaignA.id,
          categoryId: 'cat-1',
          secondaryCategoryId: null,
        },
      },
    ]

    const markers = [
      /اسلایدهای هیرو/,
      /آیتم‌های نوار اعتماد/,
      /کمپین کشف دسته‌بندی/,
      /کمپین نوار پیشنهاد/,
      /کمپین و دسته‌بندی ویژه/,
    ]

    sections.forEach((section, index) => {
      cleanup()
      renderWithRouter(
        <HomepageSectionConfigPanel
          section={section}
          index={index}
          issues={[]}
          onToggleVisibility={() => {}}
          onChange={() => {}}
        />,
      )
      expect(screen.getByText(markers[index]!)).toBeTruthy()
    })
  })

  it('routes form edits into the caller-provided section update', () => {
    const onChange = vi.fn()
    const section: HomepageDraftSection = {
      key: 'trust',
      type: 'TRUST_STRIP',
      order: 0,
      isVisible: true,
      settings: { items: [] },
    }
    renderWithRouter(
      <HomepageSectionConfigPanel
        section={section}
        index={0}
        issues={[]}
        onToggleVisibility={() => {}}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'افزودن آیتم' }))
    expect(onChange).toHaveBeenCalledWith({
      ...section,
      settings: {
        items: [{ icon: 'shield', title: '', body: undefined }],
      },
    })
  })
})
