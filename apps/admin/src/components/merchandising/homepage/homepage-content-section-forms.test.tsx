// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AdminBlogPostListItemDto,
  BlogPostDetailDto,
  BrandSummary,
  CategoryTreeNode,
  HomepageDraftSection,
  MerchCampaignBrandRef,
  MerchCampaignCategoryRef,
  MerchCampaignDto,
} from '@sabz/types'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ReadyToShipSectionForm } from './ready-to-ship-section-form'
import { ProductRailSectionForm } from './product-rail-section-form'
import { BrandShowcaseSectionForm } from './brand-showcase-section-form'
import { BlogFeatureSectionForm } from './blog-feature-section-form'
import { HomepageSectionConfigPanel } from './homepage-section-config-panel'
import { getBrand } from '../../../services/brands'
import { getCategory } from '../../../services/categories'

const detailsState = vi.hoisted(() => ({
  details: {} as Record<string, MerchCampaignDto>,
  loading: {} as Record<string, boolean>,
  errors: {} as Record<string, string>,
}))
const blogDetailsState = vi.hoisted(() => ({
  details: {} as Record<string, BlogPostDetailDto>,
  loading: {} as Record<string, boolean>,
  errors: {} as Record<string, string>,
}))
const picked = vi.hoisted(() => ({
  campaign: null as MerchCampaignDto | null,
  category: null as CategoryTreeNode | null,
  brand: null as BrandSummary | null,
  post: null as AdminBlogPostListItemDto | null,
}))

vi.mock('../../../hooks/use-merch-campaign-details', () => ({
  useMerchCampaignDetails: () => detailsState,
}))
vi.mock('../../../hooks/use-blog-post-details', () => ({
  useBlogPostDetails: () => blogDetailsState,
}))
vi.mock('../../../services/categories', () => ({ getCategory: vi.fn() }))
vi.mock('../../../services/brands', () => ({ getBrand: vi.fn() }))
vi.mock('./homepage-campaign-picker-dialog', () => ({
  HomepageCampaignPickerDialog: ({
    open,
    onPick,
  }: {
    open: boolean
    onPick: (campaign: MerchCampaignDto) => void
  }) =>
    open && picked.campaign ? (
      <button type="button" onClick={() => onPick(picked.campaign!)}>
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
    open && picked.category ? (
      <button type="button" onClick={() => onPick(picked.category!)}>
        انتخاب دسته آزمایشی
      </button>
    ) : null,
}))
vi.mock('../../merchandising/campaigns/campaign-brand-picker-dialog', () => ({
  CampaignBrandPickerDialog: ({
    open,
    onPick,
  }: {
    open: boolean
    onPick: (brand: BrandSummary) => void
  }) =>
    open && picked.brand ? (
      <button type="button" onClick={() => onPick(picked.brand!)}>
        انتخاب برند آزمایشی
      </button>
    ) : null,
}))
vi.mock('./homepage-blog-picker-dialog', () => ({
  HomepageBlogPickerDialog: ({
    open,
    onPick,
  }: {
    open: boolean
    onPick: (post: AdminBlogPostListItemDto) => void
  }) =>
    open && picked.post ? (
      <button type="button" onClick={() => onPick(picked.post!)}>
        انتخاب مطلب آزمایشی
      </button>
    ) : null,
}))

const mockGetCategory = vi.mocked(getCategory)
const mockGetBrand = vi.mocked(getBrand)

function category(id: string, name: string): MerchCampaignCategoryRef {
  return { id, name, slug: id, sortOrder: 0 }
}
function brandRef(id: string, name: string): MerchCampaignBrandRef {
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
    categories: [category('cat-1', 'دسته یک'), category('cat-2', 'دسته دو')],
    brands: [brandRef('brand-1', 'برند یک'), brandRef('brand-2', 'برند دو')],
    media: [],
    usage: { currentPublications: [], scheduledPublications: [] },
    hasUnpublishedChanges: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-11-09T10:00:00.000Z',
    ...overrides,
  }
}
const campaignA = campaign()
const campaignB = campaign({
  id: 'campaign-b',
  internalName: 'کمپین ب',
  brands: [brandRef('brand-3', 'برند سه')],
})
const campaignNoBrands = campaign({
  id: 'campaign-no-brands',
  brands: [],
})
const campaignSixBrands = campaign({
  id: 'campaign-six-brands',
  brands: Array.from({ length: 6 }, (_, index) =>
    brandRef(`brand-${index}`, `برند ${index}`),
  ),
})

const blogPost: AdminBlogPostListItemDto = {
  id: 'post-1',
  slug: 'post-1',
  title: 'مطلب یک',
  excerpt: null,
  coverImageUrl: null,
  category: null,
  authorName: null,
  publishedAt: '2026-11-09T10:00:00.000Z',
  status: 'PUBLISHED',
  statusFa: 'منتشر شده',
}
const blogDetail: BlogPostDetailDto = {
  ...blogPost,
  content: '<p>متن</p>',
  metaTitle: null,
  metaDescription: null,
}

const basePath = 'sections[0].settings'

function renderWithRouter(node: ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>)
}

describe('content/product homepage section forms (SS-278)', () => {
  beforeEach(() => {
    detailsState.details = {
      [campaignA.id]: campaignA,
      [campaignB.id]: campaignB,
      [campaignNoBrands.id]: campaignNoBrands,
      [campaignSixBrands.id]: campaignSixBrands,
    }
    detailsState.loading = {}
    detailsState.errors = {}
    blogDetailsState.details = {
      'post-1': blogDetail,
      'post-2': { ...blogDetail, id: 'post-2', slug: 'post-2', title: 'مطلب دو' },
    }
    blogDetailsState.loading = {}
    blogDetailsState.errors = {}
    picked.campaign = campaignB
    picked.category = {
      id: 'cat-9',
      name: 'دسته نهم',
      slug: 'cat-9',
      parentId: null,
      sortOrder: 0,
      isVisible: true,
      productCount: 1,
      children: [],
    }
    picked.brand = {
      id: 'brand-9',
      name: 'برند نهم',
      slug: 'brand-9',
      description: null,
      isFeatured: false,
      nameEn: null,
    }
    picked.post = {
      ...blogPost,
      id: 'post-3',
      slug: 'post-3',
      title: 'مطلب سه',
    }
    mockGetCategory.mockReset()
    mockGetBrand.mockReset()
    mockGetCategory.mockResolvedValue({
      id: 'cat-9',
      name: 'دسته نهم',
      slug: 'cat-9',
      parentId: null,
      sortOrder: 0,
      isVisible: true,
      children: [],
    })
    mockGetBrand.mockResolvedValue({
      id: 'brand-9',
      name: 'برند نهم',
      slug: 'brand-9',
      description: null,
      isFeatured: false,
      nameEn: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('READY_TO_SHIP: edits title, subtitle, and 1–8 limit without inventing product IDs', () => {
    const onChange = vi.fn()
    const section = {
      key: 'ready',
      type: 'READY_TO_SHIP' as const,
      order: 0,
      isVisible: true,
      settings: { limit: 4, title: 'آماده ارسال' },
    }
    renderWithRouter(
      <ReadyToShipSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )

    expect(screen.getByText(/محصولات این بخش به‌صورت خودکار/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /افزودن محصول/ })).toBeNull()
    expect((screen.getByLabelText('عنوان (اختیاری)') as HTMLInputElement).maxLength).toBe(120)

    fireEvent.change(screen.getByLabelText('عنوان (اختیاری)'), {
      target: { value: 'عنوان تازه' },
    })
    expect(onChange).toHaveBeenCalledWith({
      limit: 4,
      title: 'عنوان تازه',
    })
    fireEvent.change(screen.getByLabelText('تعداد محصولات'), {
      target: { value: '8' },
    })
    expect(onChange).toHaveBeenCalledWith({
      limit: 8,
      title: 'آماده ارسال',
    })
    fireEvent.change(screen.getByLabelText('زیرعنوان (اختیاری)'), {
      target: { value: 'زیرعنوان' },
    })
    expect(onChange).toHaveBeenCalledWith({
      limit: 4,
      title: 'آماده ارسال',
      subtitle: 'زیرعنوان',
    })
  })

  it('PRODUCT_RAIL: serializes query fields, sort, stock flag, and safe href', () => {
    const onChange = vi.fn()
    const section = {
      key: 'rail',
      type: 'PRODUCT_RAIL' as const,
      order: 0,
      isVisible: true,
      settings: {
        title: 'ریل',
        actionHref: '/products',
        source: {
          kind: 'query' as const,
          categoryId: null,
          brandId: null,
          sort: 'newest' as const,
          limit: 8,
          inStockOnly: false,
        },
      },
    }
    const { rerender } = renderWithRouter(
      <ProductRailSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('مرتب‌سازی'), {
      target: { value: 'price_asc' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      source: { ...section.settings.source, sort: 'price_asc' },
    })
    fireEvent.click(screen.getByLabelText('فقط محصولات موجود'))
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      source: { ...section.settings.source, inStockOnly: true },
    })
    fireEvent.change(screen.getByLabelText('تعداد محصولات'), {
      target: { value: '12' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      source: { ...section.settings.source, limit: 12 },
    })
    fireEvent.change(screen.getByLabelText('مقصد دکمه (اختیاری)'), {
      target: { value: 'https://evil.example' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      actionHref: 'https://evil.example',
    })

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب دسته‌بندی' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب دسته آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      source: { ...section.settings.source, categoryId: 'cat-9' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب برند' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب برند آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      source: { ...section.settings.source, brandId: 'brand-9' },
    })

    fireEvent.change(screen.getByLabelText('منبع محصولات'), {
      target: { value: 'campaign' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      source: { kind: 'campaign', campaignId: '' },
    })

    rerender(
      <MemoryRouter>
        <ProductRailSectionForm
          section={{
            ...section,
            settings: {
              ...section.settings,
              source: { kind: 'campaign', campaignId: campaignA.id },
            },
          }}
          issues={[]}
          basePath={basePath}
          onSettingsChange={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('کمپین الف')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('منبع محصولات'), {
      target: { value: 'query' },
    })
  })

  it('PRODUCT_RAIL: rejects unsafe external action hrefs', () => {
    const section = {
      key: 'rail',
      type: 'PRODUCT_RAIL' as const,
      order: 0,
      isVisible: true,
      settings: {
        title: 'ریل',
        actionHref: 'https://evil.example',
        source: {
          kind: 'query' as const,
          categoryId: null,
          brandId: null,
          sort: 'newest' as const,
          limit: 8,
          inStockOnly: false,
        },
      },
    }
    renderWithRouter(
      <ProductRailSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={() => {}}
      />,
    )
    expect(screen.getByText(/مقصد باید یک مسیر داخلی/)).toBeTruthy()
  })

  it('PRODUCT_RAIL: switching back to query removes campaign-only fields', () => {
    const onChange = vi.fn()
    const section = {
      key: 'rail',
      type: 'PRODUCT_RAIL' as const,
      order: 0,
      isVisible: true,
      settings: {
        title: 'ریل',
        source: { kind: 'campaign' as const, campaignId: campaignA.id },
      },
    }
    renderWithRouter(
      <ProductRailSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('منبع محصولات'), {
      target: { value: 'query' },
    })
    expect(onChange).toHaveBeenCalledWith({
      ...section.settings,
      source: {
        kind: 'query',
        categoryId: null,
        brandId: null,
        sort: 'newest',
        limit: 8,
        inStockOnly: false,
      },
    })
  })

  it('BRAND_SHOWCASE: shows campaign brands and enforces 1–5 plus 1–6 products', () => {
    const onChange = vi.fn()
    const section = {
      key: 'brands',
      type: 'BRAND_SHOWCASE' as const,
      order: 0,
      isVisible: true,
      settings: { campaignId: campaignA.id, productsPerBrand: 3 },
    }
    const { rerender } = renderWithRouter(
      <BrandShowcaseSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    expect(screen.getByText('برند یک')).toBeTruthy()
    expect(screen.getByText('برند دو')).toBeTruthy()
    expect(screen.getByText('۲ برند')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('تعداد محصول هر برند'), {
      target: { value: '6' },
    })
    expect(onChange).toHaveBeenCalledWith({
      campaignId: campaignA.id,
      productsPerBrand: 6,
    })
    fireEvent.click(screen.getByRole('button', { name: 'تغییر کمپین' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب کمپین آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({
      campaignId: campaignB.id,
      productsPerBrand: 3,
    })

    rerender(
      <MemoryRouter>
        <BrandShowcaseSectionForm
          section={{ ...section, settings: { ...section.settings, campaignId: campaignNoBrands.id } }}
          issues={[]}
          basePath={basePath}
          onSettingsChange={() => {}}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/این کمپین برندی ندارد/)).toBeTruthy()
  })

  it('BRAND_SHOWCASE: rejects more than five campaign brands', () => {
    const section = {
      key: 'brands',
      type: 'BRAND_SHOWCASE' as const,
      order: 0,
      isVisible: true,
      settings: { campaignId: campaignSixBrands.id, productsPerBrand: 3 },
    }
    renderWithRouter(
      <BrandShowcaseSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={() => {}}
      />,
    )
    expect(screen.getByText('۶ برند')).toBeTruthy()
    expect(screen.getByText(/حداکثر ۵ برند/)).toBeTruthy()
  })

  it('BLOG_FEATURE: latest mode serializes limit and drops manual IDs', () => {
    const onChange = vi.fn()
    const section = {
      key: 'blog',
      type: 'BLOG_FEATURE' as const,
      order: 0,
      isVisible: true,
      settings: { source: 'latest' as const, limit: 3 },
    }
    renderWithRouter(
      <BlogFeatureSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText('تعداد مطالب'), {
      target: { value: '2' },
    })
    expect(onChange).toHaveBeenCalledWith({ source: 'latest', limit: 2 })
    fireEvent.change(screen.getByLabelText('حالت انتخاب مطالب'), {
      target: { value: 'manual' },
    })
    expect(onChange).toHaveBeenCalledWith({ source: 'manual', postIds: [] })
  })

  it('BLOG_FEATURE: manual mode adds/removes/orders distinct published posts', () => {
    const onChange = vi.fn()
    const section = {
      key: 'blog',
      type: 'BLOG_FEATURE' as const,
      order: 0,
      isVisible: true,
      settings: { source: 'manual' as const, postIds: ['post-1', 'post-2'] },
    }
    const { rerender } = renderWithRouter(
      <BlogFeatureSectionForm
        section={section}
        issues={[]}
        basePath={basePath}
        onSettingsChange={onChange}
      />,
    )
    expect(screen.getByText('مطلب یک')).toBeTruthy()
    expect(screen.getByText('مطلب دو')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'جابه‌جایی مطلب ۱ به پایین' }),
    )
    expect(onChange).toHaveBeenCalledWith({
      source: 'manual',
      postIds: ['post-2', 'post-1'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'حذف مطلب ۱' }))
    expect(onChange).toHaveBeenCalledWith({
      source: 'manual',
      postIds: ['post-2'],
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن مطلب' }))
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب مطلب آزمایشی' }))
    expect(onChange).toHaveBeenCalledWith({
      source: 'manual',
      postIds: ['post-1', 'post-2', 'post-3'],
    })
    fireEvent.change(screen.getByLabelText('حالت انتخاب مطالب'), {
      target: { value: 'latest' },
    })
    expect(onChange).toHaveBeenCalledWith({ source: 'latest', limit: 3 })

    rerender(
      <MemoryRouter>
        <BlogFeatureSectionForm
          section={{
            ...section,
            settings: { source: 'manual', postIds: ['post-1', 'post-2', 'post-3'] },
          }}
          issues={[]}
          basePath={basePath}
          onSettingsChange={() => {}}
        />
      </MemoryRouter>,
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'افزودن مطلب',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('BLOG_FEATURE: flags an existing draft post and preserves field errors', () => {
    blogDetailsState.details = {
      'post-1': { ...blogDetail, status: 'DRAFT', statusFa: 'پیش‌نویس' },
    }
    const section = {
      key: 'blog',
      type: 'BLOG_FEATURE' as const,
      order: 0,
      isVisible: true,
      settings: { source: 'manual' as const, postIds: ['post-1'] },
    }
    renderWithRouter(
      <BlogFeatureSectionForm
        section={section}
        issues={[
          {
            path: `${basePath}.postIds[0]`,
            code: 'BLOG_POST_NOT_PUBLISHED',
            message: 'مقاله انتخاب‌شده منتشر نشده است.',
            severity: 'ERROR',
            category: 'INELIGIBLE_REFERENCE',
          },
        ]}
        basePath={basePath}
        onSettingsChange={() => {}}
      />,
    )
    expect(screen.getByText('این مطلب اکنون منتشرشده نیست.')).toBeTruthy()
    expect(
      screen.getByText('مقاله انتخاب‌شده منتشر نشده است.'),
    ).toBeTruthy()
  })
})

describe('config panel dispatch for SS-278 forms', () => {
  beforeEach(() => {
    detailsState.details = { [campaignA.id]: campaignA }
    detailsState.loading = {}
    detailsState.errors = {}
    blogDetailsState.details = { 'post-1': blogDetail }
    blogDetailsState.loading = {}
    blogDetailsState.errors = {}
  })

  afterEach(cleanup)

  it('renders each remaining discriminant', () => {
    const sections: HomepageDraftSection[] = [
      {
        key: 'ready',
        type: 'READY_TO_SHIP',
        order: 0,
        isVisible: true,
        settings: { limit: 4 },
      },
      {
        key: 'rail',
        type: 'PRODUCT_RAIL',
        order: 1,
        isVisible: true,
        settings: {
          title: 'ریل',
          source: {
            kind: 'query',
            categoryId: null,
            brandId: null,
            sort: 'newest',
            limit: 8,
            inStockOnly: false,
          },
        },
      },
      {
        key: 'brands',
        type: 'BRAND_SHOWCASE',
        order: 2,
        isVisible: true,
        settings: { campaignId: campaignA.id, productsPerBrand: 3 },
      },
      {
        key: 'blog',
        type: 'BLOG_FEATURE',
        order: 3,
        isVisible: true,
        settings: { source: 'latest', limit: 3 },
      },
    ]
    const markers = [
      'تعداد محصولات',
      'منبع محصولات',
      'تعداد محصول هر برند',
      'حالت انتخاب مطالب',
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
})
