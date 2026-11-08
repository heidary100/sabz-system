// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PricingPage } from './pricing-page'

/**
 * SS-268 static-table exclusion: the pricing page hosts four tabs, three of
 * which are paginated server lists. The partner-tier tab is a small
 * reference set with no pagination — it must NOT gain bars just because its
 * siblings have them.
 */
const listState = (overrides: Record<string, unknown> = {}) => ({
  active: '',
  page: 1,
  limit: 20,
  result: null,
  loading: false,
  error: null,
  setActive: vi.fn(),
  setPage: vi.fn(),
  setLimit: vi.fn(),
  refetch: vi.fn(),
  ...overrides,
})

vi.mock('../hooks/use-pricing-list', () => ({
  useCategoryRuleList: () =>
    listState({
      result: {
        items: [
          {
            id: 'rule-1',
            categoryId: 'cat-1',
            categoryName: 'هندزفری',
            type: 'PERCENT',
            value: '10',
            isActive: true,
            startsAt: null,
            endsAt: null,
            priority: 1,
            createdAt: '2026-11-01T08:00:00.000Z',
            updatedAt: '2026-11-01T08:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    }),
  useProductOverrideList: () =>
    listState({ result: { items: [], total: 0, page: 1, limit: 20 } }),
  usePromotionList: () => listState({ result: { items: [], total: 0, page: 1, limit: 20 } }),
}))

vi.mock('../hooks/use-partner-tier-list', () => ({
  usePartnerTierList: () => ({
    tiers: [
      {
        id: 'tier-1',
        name: 'همکار طلایی',
        discountPercent: '12',
        minOrderQuantity: 50,
        partnerCount: 3,
      },
    ],
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/pricing']}>
      <PricingPage />
    </MemoryRouter>,
  )
}

describe('PricingPage pagination (SS-268)', () => {
  it('paginates the rule tab with top + bottom bars', () => {
    renderPage()

    expect(screen.getByRole('navigation', { name: 'صفحه‌بندی بالا' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'صفحه‌بندی پایین' })).toBeTruthy()
  })

  it('leaves the static partner-tier tab unpaginated', () => {
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'پله‌های همکاری' }))

    expect(screen.getByText('همکار طلایی')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: /صفحه‌بندی/ })).toBeNull()
  })
})
