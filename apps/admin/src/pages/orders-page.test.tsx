// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminOrderListResponse } from '@sabz/types'
import { OrdersPage } from './orders-page'
import { listOrders } from '../services/orders'

/**
 * SS-268 route wiring: the orders page is the representative hook-driven
 * list. Both pagination bars must be present, expose distinct landmark
 * names, and be driven by the SAME hook state — clicking either one moves
 * both and reaches the server query.
 */
vi.mock('../services/orders', () => ({
  listOrders: vi.fn(),
}))

const mockListOrders = vi.mocked(listOrders)

const response: AdminOrderListResponse = {
  items: [
    {
      id: 'o1',
      orderNumber: 1001,
      status: 'SHIPPED',
      statusFa: 'ارسال شده',
      itemCount: 2,
      total: '1500000',
      createdAt: '2026-11-01T08:00:00.000Z',
      userId: 'u1',
      customerMobile: '+989121000001',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
    },
    {
      id: 'o2',
      orderNumber: 1002,
      status: 'PENDING',
      statusFa: 'در انتظار بررسی',
      itemCount: 1,
      total: '250000',
      createdAt: '2026-11-02T08:00:00.000Z',
      userId: 'u2',
      customerMobile: '+989121000002',
      paymentMethod: 'ONLINE',
      paymentStatus: 'PAID',
    },
  ],
  total: 45,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/orders']}>
      <OrdersPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockListOrders.mockReset()
  mockListOrders.mockResolvedValue(response)
})

afterEach(cleanup)

describe('OrdersPage pagination (SS-268)', () => {
  it('renders one labelled bar above and one below the table', async () => {
    renderPage()

    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'صفحه‌بندی بالا' })).toBeTruthy(),
    )
    expect(screen.getByRole('navigation', { name: 'صفحه‌بندی پایین' })).toBeTruthy()
    expect(screen.getAllByText('صفحه ۱ از ۳')).toHaveLength(2)
  })

  it('drives both bars from one state source and queries the server page', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('صفحه ۱ از ۳')).toHaveLength(2))

    const bottomBar = screen.getByRole('navigation', { name: 'صفحه‌بندی پایین' })
    fireEvent.click(
      Array.from(bottomBar.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === 'صفحه بعد',
      )!,
    )

    await waitFor(() => expect(screen.getAllByText('صفحه ۲ از ۳')).toHaveLength(2))
    expect(mockListOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('asks the server for the selected page size and resets to page one', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('صفحه ۱ از ۳')).toHaveLength(2))

    // Move off page one first, so the reset is actually exercised.
    const bottomBar = screen.getByRole('navigation', { name: 'صفحه‌بندی پایین' })
    fireEvent.click(within(bottomBar).getByRole('button', { name: 'صفحه بعد' }))
    await waitFor(() => expect(screen.getAllByText('صفحه ۲ از ۳')).toHaveLength(2))

    fireEvent.change(screen.getByLabelText('تعداد در هر صفحه (بالا)'), {
      target: { value: '50' },
    })

    await waitFor(() =>
      expect(mockListOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, limit: 50 }),
      ),
    )
    // API-safe option set for this route (the DTO caps limit at 50).
    expect(screen.queryByRole('option', { name: '۱۰۰' })).toBeNull()
  })
})
