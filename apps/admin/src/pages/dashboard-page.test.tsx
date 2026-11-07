// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/use-dashboard', () => ({
  useDashboard: () => ({
    dashboard: {
      users: { total: 1, active: 1, suspended: 0, locked: 0, pendingOtp: 0 },
      roles: { customer: 0, partner: 0, operator: 0, admin: 1 },
      partners: { draft: 0, pending: 0, approved: 1, rejected: 0 },
      commerce: {
        ordersByStatus: { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 },
        totalOrders: 0,
        paidRevenueRial: '0',
        payments: { cod: 0, online: 0, codSharePct: 0 },
        pendingRfqs: 0,
        pendingReviews: 0,
        draftPosts: 0,
        ordersByDay: [],
      },
      recentPartners: [],
      recentAudit: [
        {
          id: 'audit-1',
          userId: null,
          actor: null,
          action: 'PRODUCT_PUBLISHED',
          entity: 'Product',
          entityId: null,
          createdAt: '2026-11-07T00:00:00.000Z',
        },
      ],
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

import { DashboardPage } from './dashboard-page'

describe('DashboardPage (SS-271)', () => {
  afterEach(cleanup)

  it('renders the dashboard with translated audit labels and shared empty states', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )

    expect(screen.getAllByText('پیشخوان').length).toBeGreaterThan(0)
    expect(screen.getByText('انتشار محصول')).toBeTruthy()
    expect(screen.getByText('محصول')).toBeTruthy()
    expect(screen.queryByText('PRODUCT_PUBLISHED')).toBeNull()
    expect(screen.getByText('درخواست جدیدی ثبت نشده است.')).toBeTruthy()
    expect(screen.queryByText('هنوز فعالیتی ثبت نشده است.')).toBeNull()
  })
})
