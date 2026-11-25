// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminOrderListResponse } from '@sabz/types'
import { EnglishOrdersPage } from './english-orders-page'

const refetch = vi.fn()

const orderResult = vi.hoisted<AdminOrderListResponse>(() => ({
  total: 1,
  items: [
    {
      id: 'order-1',
      orderNumber: 1001,
      status: 'PENDING',
      statusFa: 'در انتظار بررسی',
      itemCount: 1,
      total: '10000000',
      createdAt: '2026-11-21T10:00:00.000Z',
      userId: 'u1',
      customerMobile: '+989120000001',
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      note: 'Please call before delivery',
      shipment: { status: 'PENDING', trackingNumber: null },
    },
  ],
}))

vi.mock('../hooks/use-order-list', () => ({
  useOrderList: () => ({
    status: '',
    page: 1,
    limit: 20,
    result: orderResult,
    loading: false,
    error: null,
    setStatus: vi.fn(),
    setPage: vi.fn(),
    setLimit: vi.fn(),
    refetch,
  }),
}))

vi.mock('../services/orders', () => ({
  transitionOrder: vi.fn(),
  updateShipment: vi.fn(),
}))

import { transitionOrder, updateShipment } from '../services/orders'



beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  refetch.mockReset()
  vi.mocked(transitionOrder).mockReset()
  vi.mocked(updateShipment).mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('English LTR order operations', () => {
  it('shows the customer note and saves inline status and tracking changes', async () => {
    vi.mocked(transitionOrder).mockResolvedValue({} as never)
    vi.mocked(updateShipment).mockResolvedValue({} as never)

    render(
      <MemoryRouter>
        <EnglishOrdersPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Orders' })).toBeTruthy()
    expect(screen.getByText('Please call before delivery')).toBeTruthy()
    expect(screen.getAllByText('Pending review').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Change status for order 1001'), {
      target: { value: 'PROCESSING' },
    })
    await waitFor(() =>
      expect(transitionOrder).toHaveBeenCalledWith('order-1', 'PROCESSING'),
    )

    fireEvent.change(screen.getByLabelText('Tracking code for order 1001'), {
      target: { value: 'TRACK-77' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(updateShipment).toHaveBeenCalledWith('order-1', {
        trackingNumber: 'TRACK-77',
      }),
    )
    expect(refetch).toHaveBeenCalled()
  })
})
