// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type {
  HomepageDraftDto,
  HomepageDraftValidationResult,
  HomepagePublicationListResponse,
  HomepagePublicationSummaryDto,
  MerchCampaignListResponse,
  MerchMediaListResponse,
} from '@sabz/types'
import { MerchandisingOverviewPage } from './merchandising-overview-page'
import type { MerchOverviewSection } from '../../hooks/use-merchandising-overview'
import { formatTehranDateTime } from '../../lib/tehran-time'

const auth = vi.hoisted(() => ({ roles: ['ADMIN'] as string[] }))
const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../../auth/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', roles: auth.roles },
    isAdmin: auth.roles.some((role) => role === 'ADMIN' || role === 'OPERATOR'),
  }),
}))

vi.mock('../../hooks/use-merchandising-overview', () => ({
  useMerchandisingOverview: () => hook.value,
}))

function section<T>(
  data: T | null,
  loading = false,
  error: unknown = null,
): MerchOverviewSection<T> {
  return { data, loading, error, reload: vi.fn() }
}

const currentPublication: HomepagePublicationSummaryDto = {
  id: 'publication-current',
  version: 7,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T10:00:00.000Z',
  sourceDraftRevision: 4,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T10:00:00.000Z',
}

const scheduledItems: HomepagePublicationSummaryDto[] = [
  {
    ...currentPublication,
    id: 'publication-scheduled-late',
    version: 10,
    status: 'SCHEDULED',
    publishAt: '2026-11-13T10:00:00.000Z',
    publishedAt: null,
  },
  {
    ...currentPublication,
    id: 'publication-scheduled-earliest',
    version: 9,
    status: 'SCHEDULED',
    publishAt: '2026-11-11T10:00:00.000Z',
    publishedAt: null,
  },
  {
    ...currentPublication,
    id: 'publication-scheduled-middle',
    version: 8,
    status: 'SCHEDULED',
    publishAt: '2026-11-12T10:00:00.000Z',
    publishedAt: null,
  },
  {
    ...currentPublication,
    id: 'publication-scheduled-later',
    version: 12,
    status: 'SCHEDULED',
    publishAt: '2026-11-15T10:00:00.000Z',
    publishedAt: null,
  },
  {
    ...currentPublication,
    id: 'publication-scheduled-later-2',
    version: 11,
    status: 'SCHEDULED',
    publishAt: '2026-11-14T10:00:00.000Z',
    publishedAt: null,
  },
]

const scheduledList: HomepagePublicationListResponse = {
  items: scheduledItems,
  total: 7,
  page: 1,
  limit: 5,
}

const draft: HomepageDraftDto = {
  revision: 4,
  schemaVersion: 1,
  sections: [],
  updatedAt: '2026-11-10T09:00:00.000Z',
}

const validation: HomepageDraftValidationResult = {
  revision: 4,
  schemaVersion: 1,
  valid: true,
  errors: [],
  warnings: [],
}

const campaigns: MerchCampaignListResponse = {
  items: [
    {
      id: 'campaign-1',
      internalName: 'campaign-internal',
      type: 'SEASONAL',
      titleFa: 'کمپین پاییز',
      status: 'ACTIVE_WINDOW',
      scheduleStatus: 'ACTIVE',
      isEnabled: true,
      isArchived: false,
      startsAt: null,
      endsAt: null,
      priority: 0,
      archivedAt: null,
      updatedAt: '2026-11-10T11:00:00.000Z',
    },
  ],
  total: 6,
  page: 1,
  limit: 5,
}

const media: MerchMediaListResponse = {
  items: [
    {
      id: 'media-1',
      originalName: 'hero-banner.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 1200,
      height: 800,
      altFa: null,
      status: 'DRAFT',
      publishedAt: null,
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T12:00:00.000Z',
    },
  ],
  total: 6,
  page: 1,
  limit: 5,
}

function populatedState() {
  return {
    currentPublication: section(currentPublication),
    scheduledPublications: section(scheduledList),
    draft: section(draft),
    draftValidation: section(validation),
    campaigns: section(campaigns),
    media: section(media),
    refreshAll: vi.fn(),
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/merchandising']}>
      <MerchandisingOverviewPage />
    </MemoryRouter>,
  )
}

describe('MerchandisingOverviewPage (SS-282)', () => {
  beforeEach(() => {
    auth.roles = ['ADMIN']
    hook.value = populatedState()
  })

  afterEach(cleanup)

  it('renders independent loading states', () => {
    hook.value = {
      currentPublication: section(null, true),
      scheduledPublications: section(null, true),
      draft: section(null, true),
      draftValidation: section(null, false),
      campaigns: section(null, true),
      media: section(null, true),
      refreshAll: vi.fn(),
    }
    renderPage()

    expect(screen.getByText('در حال بارگذاری نسخه منتشرشده…')).toBeTruthy()
    expect(screen.getByText('در حال بارگذاری انتشارهای زمان‌بندی‌شده…')).toBeTruthy()
    expect(screen.getByText('در حال بارگذاری پیش‌نویس صفحه اصلی…')).toBeTruthy()
    expect(screen.getByText('در حال بارگذاری کمپین‌ها…')).toBeTruthy()
    expect(screen.getByText('در حال بارگذاری رسانه‌ها…')).toBeTruthy()

    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(1)
    expect(statuses[0]!.textContent).toBe('در حال بارگذاری وضعیت بازاریابی…')
  })

  it('renders empty states without hiding other sections', () => {
    hook.value = {
      currentPublication: section(null),
      scheduledPublications: section({ items: [], total: 0, page: 1, limit: 5 }),
      draft: section({ ...draft, sections: [] }),
      draftValidation: section(validation),
      campaigns: section({ items: [], total: 0, page: 1, limit: 5 }),
      media: section({ items: [], total: 0, page: 1, limit: 5 }),
      refreshAll: vi.fn(),
    }
    renderPage()

    expect(screen.getByText('هنوز نسخه‌ای منتشر نشده است')).toBeTruthy()
    expect(screen.getByText('انتشار زمان‌بندی‌شده‌ای وجود ندارد')).toBeTruthy()
    expect(screen.getByText('پیش‌نویس صفحه اصلی خالی است')).toBeTruthy()
    expect(screen.getByText('هنوز کمپینی ثبت نشده است')).toBeTruthy()
    expect(screen.getByText('کتابخانه رسانه خالی است')).toBeTruthy()
  })

  it('renders populated sections and selects the earliest returned publishAt', () => {
    renderPage()

    expect(screen.getByText('نسخه ۷')).toBeTruthy()
    expect(screen.getByText('نسخه ۹')).toBeTruthy()
    expect(screen.getByText('کمپین پاییز')).toBeTruthy()
    expect(screen.getByText('hero-banner.webp')).toBeTruthy()
    expect(screen.getByText(/۷ نسخه زمان‌بندی‌شده/)).toBeTruthy()
    expect(screen.getByText(/از میان ۵ نسخه اخیر/)).toBeTruthy()
    expect(screen.queryByText('نسخه ۱۰')).toBeNull()
    expect(
      screen.getByText(formatTehranDateTime(currentPublication.publishedAt)),
    ).toBeTruthy()
    expect(screen.getAllByText('منتشرشده').length).toBeGreaterThan(0)
    expect(screen.getAllByText('زمان‌بندی‌شده').length).toBeGreaterThan(0)
  })

  it('handles a missing scheduled publishAt without fabricating a date', () => {
    hook.value = {
      ...populatedState(),
      scheduledPublications: section({
        items: [
          {
            ...currentPublication,
            id: 'publication-scheduled-no-date',
            status: 'SCHEDULED',
            publishAt: null,
            publishedAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 5,
      }),
    }
    renderPage()

    expect(
      screen.getByText('زمان انتشار این نسخه معتبر نیست و نمایش داده نمی‌شود.'),
    ).toBeTruthy()
  })

  it('keeps remaining cards visible when some cards fail and retries them', () => {
    const currentReload = vi.fn()
    const campaignReload = vi.fn()
    hook.value = {
      ...populatedState(),
      currentPublication: {
        ...section(null, false, new Error('current failed')),
        reload: currentReload,
      },
      campaigns: {
        ...section(null, false, new Error('campaigns failed')),
        reload: campaignReload,
      },
    }
    renderPage()

    expect(screen.getByText('نسخه ۹')).toBeTruthy()
    expect(screen.getByText('hero-banner.webp')).toBeTruthy()
    const retryButtons = screen.getAllByRole('button', { name: 'تلاش مجدد' })
    expect(retryButtons).toHaveLength(2)
    fireEvent.click(retryButtons[0]!)
    fireEvent.click(retryButtons[1]!)
    expect(currentReload).toHaveBeenCalledTimes(1)
    expect(campaignReload).toHaveBeenCalledTimes(1)
  })

  it('preserves draft summary when validation fails and retries validation only', () => {
    const validationReload = vi.fn()
    hook.value = {
      ...populatedState(),
      draftValidation: {
        ...section(null, false, new Error('validation failed')),
        reload: validationReload,
      },
    }
    renderPage()

    expect(screen.getByText('نسخه پیش‌نویس')).toBeTruthy()
    expect(screen.getByText('اعتبارسنجی نامشخص')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد اعتبارسنجی' }))
    expect(validationReload).toHaveBeenCalledTimes(1)
  })

  it('shows server readiness and the editor link', () => {
    renderPage()

    expect(screen.getByText('آماده انتشار')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'ویرایش صفحه اصلی' })
        .getAttribute('href'),
    ).toBe('/merchandising/homepage')
  })

  it('renders the expected navigation links', () => {
    renderPage()

    expect(
      screen.getByRole('link', { name: 'انتشارها' }).getAttribute('href'),
    ).toBe('/merchandising/publications')
    expect(
      screen.getByRole('link', { name: 'کمپین‌ها' }).getAttribute('href'),
    ).toBe('/merchandising/campaigns')
    expect(
      screen.getByRole('link', { name: 'کتابخانه رسانه' }).getAttribute('href'),
    ).toBe('/merchandising/media')
    expect(
      screen
        .getAllByRole('link', { name: 'مشاهده جزئیات انتشار' })
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/merchandising/publications/publication-current',
      '/merchandising/publications/publication-scheduled-earliest',
    ])
    expect(
      screen.getByRole('link', { name: 'کمپین پاییز' }).getAttribute('href'),
    ).toBe('/merchandising/campaigns/campaign-1')
  })

  it('shows admin-only navigation shortcuts only to ADMIN', () => {
    renderPage()
    expect(
      screen.getByText('انتشار فوری یا زمان‌بندی (در ویرایشگر صفحه اصلی)'),
    ).toBeTruthy()

    cleanup()
    auth.roles = ['OPERATOR']
    renderPage()
    expect(
      screen.queryByText('انتشار فوری یا زمان‌بندی (در ویرایشگر صفحه اصلی)'),
    ).toBeNull()
    expect(screen.getByRole('link', { name: 'کتابخانه رسانه' })).toBeTruthy()
  })
})
