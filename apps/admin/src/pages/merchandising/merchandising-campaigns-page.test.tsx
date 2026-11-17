// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { MerchCampaignDto, MerchCampaignSummaryDto } from '@sabz/types'
import { MerchandisingCampaignsPage } from './merchandising-campaigns-page'
import {
  disableMerchCampaign,
  enableMerchCampaign,
} from '../../services/merchandising'
import { ApiError } from '../../services/api'

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../../hooks/use-merch-campaign-list', () => ({
  useMerchCampaignList: () => hook.value,
}))

vi.mock('../../services/merchandising', () => ({
  enableMerchCampaign: vi.fn(),
  disableMerchCampaign: vi.fn(),
}))

const mockDisable = vi.mocked(disableMerchCampaign)
const mockEnable = vi.mocked(enableMerchCampaign)

const summary: MerchCampaignSummaryDto = {
  id: 'campaign-1',
  internalName: 'کمپین پاییز',
  type: 'SEASONAL',
  titleFa: 'پاییز گرم',
  status: 'ACTIVE_WINDOW',
  scheduleStatus: 'ACTIVE',
  isEnabled: true,
  isArchived: false,
  startsAt: '2026-11-09T10:00:00.000Z',
  endsAt: '2026-11-10T10:00:00.000Z',
  priority: 5,
  archivedAt: null,
  updatedAt: '2026-11-09T10:00:00.000Z',
}

function detail(overrides: Partial<MerchCampaignDto> = {}): MerchCampaignDto {
  return {
    ...summary,
    eyebrowFa: null,
    subtitleFa: null,
    descriptionFa: null,
    ctaLabelFa: null,
    cta: { kind: 'NONE' },
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

function state(overrides: Record<string, unknown> = {}) {
  return {
    search: '',
    type: '',
    isEnabled: '',
    isArchived: 'false',
    page: 1,
    limit: 20,
    result: null,
    loading: false,
    error: null,
    setSearch: vi.fn(),
    setType: vi.fn(),
    setEnabled: vi.fn(),
    setArchived: vi.fn(),
    setPage: vi.fn(),
    setLimit: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/merchandising/campaigns']}>
      <MerchandisingCampaignsPage />
    </MemoryRouter>,
  )
}

describe('MerchandisingCampaignsPage (SS-275)', () => {
  beforeEach(() => {
    hook.value = state()
    mockDisable.mockReset()
    mockEnable.mockReset()
  })

  afterEach(cleanup)

  it('renders loading, error, and empty states', () => {
    hook.value = state({ loading: true })
    const { rerender } = renderPage()
    expect(screen.getByText('در حال بارگذاری کمپین‌ها…')).toBeTruthy()

    hook.value = state({ error: new Error('network') })
    rerender(
      <MemoryRouter>
        <MerchandisingCampaignsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'خطایی رخ داد. دوباره تلاش کنید.',
    )

    hook.value = state({
      result: { items: [], total: 0, page: 1, limit: 20 },
    })
    rerender(
      <MemoryRouter>
        <MerchandisingCampaignsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('هنوز کمپینی ثبت نشده است')).toBeTruthy()
  })

  it('forwards search and filters to the list hook', () => {
    const setSearch = vi.fn()
    const setType = vi.fn()
    const setEnabled = vi.fn()
    const setArchived = vi.fn()
    hook.value = state({
      setSearch,
      setType,
      setEnabled,
      setArchived,
      result: { items: [summary], total: 1, page: 1, limit: 20 },
    })
    renderPage()

    fireEvent.change(screen.getByLabelText('جستجو'), {
      target: { value: 'پاییز' },
    })
    fireEvent.change(screen.getByLabelText('نوع کمپین'), {
      target: { value: 'SEASONAL' },
    })
    fireEvent.change(screen.getByLabelText('فعال بودن'), {
      target: { value: 'false' },
    })
    fireEvent.change(screen.getByLabelText('بایگانی'), {
      target: { value: 'true' },
    })

    expect(setSearch).toHaveBeenCalledWith('پاییز')
    expect(setType).toHaveBeenCalledWith('SEASONAL')
    expect(setEnabled).toHaveBeenCalledWith('false')
    expect(setArchived).toHaveBeenCalledWith('true')
  })

  it('renders status and disables an enabled campaign from the list', async () => {
    const refetch = vi.fn()
    mockDisable.mockResolvedValue(detail({ isEnabled: false, status: 'DISABLED' }))
    hook.value = state({
      refetch,
      result: { items: [summary], total: 1, page: 1, limit: 20 },
    })
    renderPage()

    const row = screen.getByText('کمپین پاییز').closest('tr')!
    expect(within(row).getByText('در بازه فعال')).toBeTruthy()
    expect(within(row).getByText('فصلی')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال‌سازی' }))

    await waitFor(() => expect(mockDisable).toHaveBeenCalledWith('campaign-1'))
    await waitFor(() => expect(refetch).toHaveBeenCalled())
    expect(screen.getByText('کمپین «کمپین پاییز» غیرفعال شد.')).toBeTruthy()
  })

  it('reports lifecycle API errors through the structured parser', async () => {
    mockEnable.mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'کمپین آرشیوشده قابل فعال‌سازی نیست.',
      }),
    )
    hook.value = state({
      result: {
        items: [{ ...summary, isEnabled: false, status: 'DISABLED' }],
        total: 1,
        page: 1,
        limit: 20,
      },
    })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'فعال‌سازی' }))
    expect(
      await screen.findByText('کمپین آرشیوشده قابل فعال‌سازی نیست.'),
    ).toBeTruthy()
  })
})
