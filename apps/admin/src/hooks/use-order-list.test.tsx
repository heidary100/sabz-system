// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminOrderListResponse } from '@sabz/types'
import { useOrderList } from './use-order-list'
import { listOrders } from '../services/orders'

vi.mock('../services/orders', () => ({
  listOrders: vi.fn(),
}))

const mockListOrders = vi.mocked(listOrders)

const EMPTY_RESULT: AdminOrderListResponse = {
  items: [],
  total: 100,
}

describe('useOrderList page size (SS-272)', () => {
  beforeEach(() => {
    mockListOrders.mockReset()
    mockListOrders.mockResolvedValue(EMPTY_RESULT)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('requests the default page size of 20', async () => {
    const { result } = renderHook(() => useOrderList())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockListOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    )
  })

  it('resets to the first page when the page size changes', async () => {
    const { result } = renderHook(() => useOrderList())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setPage(3))
    await waitFor(() =>
      expect(mockListOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 3, limit: 20 }),
      ),
    )

    act(() => result.current.setLimit(50))
    await waitFor(() =>
      expect(mockListOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, limit: 50 }),
      ),
    )
    expect(result.current.page).toBe(1)
    expect(result.current.limit).toBe(50)
  })
})
